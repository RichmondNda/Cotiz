import { createHash } from 'node:crypto';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { type INestApplication, type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { StoredFile, UploadTicket } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { AppModule } from '../../src/app.module.js';
import { type Config, loadConfig } from '../../src/config.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, type IsolationHarness, seedAssociations, startIsolationHarness, USERS } from '../isolation/harness.js';
import { EICAR, type FakeClamd, startFakeClamd } from '../support/fake-clamd.js';
import { startMinio, type TestMinio } from '../support/minio.js';
import { as, TestAuthGuard } from '../support/test-auth.js';

/**
 * Analyse des fichiers (lot 0.5, étape 4), de bout en bout : api, relais outbox (1 s, comme en production), file
 * `files` du worker, MinIO, faux clamd (EICAR). Vérification de l'étape : EICAR → infected et file_not_clean ;
 * PDF sain → clean en moins de 2 s.
 */

type Ticket = z.infer<typeof UploadTicket>;

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const moussa = as({ space: 'subscriber', userId: USERS.moussa, role: 'subscriber' });
const awa = as({ space: 'association', associationId: A.id, userId: USERS.awa, role: 'owner' });
const sha256 = (content: Buffer) => createHash('sha256').update(content).digest('hex');

describe('analyse des fichiers (worker, file files)', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let minio: TestMinio;
  let clamd: FakeClamd;
  let api: INestApplication;
  let worker: INestApplicationContext;
  let s3: S3Client;
  let base: string;

  const post = (path: string, headers: Record<string, string>, body?: unknown) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  /** Demande et dépôt direct ; renvoie le ticket (la confirmation est mesurée par chaque test). */
  async function deposit(headers: Record<string, string>, purpose: string, mimeType: string, content: Buffer) {
    const res = await post('/uploads', headers, { purpose, fileName: 'fichier', mimeType, sizeBytes: content.length });
    expect(res.status).toBe(201);
    const ticket: Ticket = UploadTicket.parse(await res.json());
    const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: content });
    expect(put.status).toBe(200);
    return ticket;
  }

  const fileRow = async (id: string) =>
    (await h.superuser('SELECT * FROM files WHERE id = $1', [id])).rows[0] as {
      bucket: string;
      object_key: string;
      scan_status: string;
      sha256: string | null;
      size_bytes: string;
    };

  const exists = async (bucket: string, key: string) =>
    s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).then(
      () => true,
      () => false,
    );

  const read = async (bucket: string, key: string) =>
    Buffer.from(
      (await (await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body?.transformToByteArray()) ??
        new Uint8Array(),
    );

  beforeAll(async () => {
    [h, redis, minio, clamd] = await Promise.all([
      startIsolationHarness('migrated'),
      new RedisContainer('redis:7-alpine').start(),
      startMinio(),
      startFakeClamd(),
    ]);
    await seedAssociations(h);
    const env = {
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY_ID: minio.accessKeyId,
      S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
      CLAMAV_URL: clamd.url,
    };
    const config: Config = loadConfig(env);
    @Module({ imports: [AppModule.register(config, { guards: [TestAuthGuard] })] })
    class TestRoot {}
    api = await NestFactory.create(TestRoot, { logger: false });
    api.setGlobalPrefix('api/v1');
    await api.listen(0, '127.0.0.1');
    base = `${await api.getUrl()}/api/v1`;
    worker = await NestFactory.createApplicationContext(WorkerModule.register(config), { logger: false });
    s3 = new S3Client({
      endpoint: minio.endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: minio.accessKeyId, secretAccessKey: minio.secretAccessKey },
    });
  });

  afterAll(async () => {
    s3.destroy();
    await api.close();
    await worker.close();
    await Promise.all([h.stop(), redis.stop(), minio.stop(), clamd.close()]);
  });

  it('PDF sain → clean en moins de 2 s, déplacé hors de la quarantaine, empreinte calculée', async () => {
    const ticket = await deposit(moussa, 'payment_proof', 'application/pdf', PDF);
    const started = Date.now();
    const res = await post(`/uploads/${ticket.fileId}/complete`, moussa);
    const elapsed = Date.now() - started;
    expect(res.status).toBe(202);
    const file = StoredFile.parse(await res.json());
    expect(file).toMatchObject({ scanStatus: 'clean', sha256: sha256(PDF), sizeBytes: PDF.length });
    expect(elapsed).toBeLessThan(2_000);

    const row = await fileRow(ticket.fileId);
    expect(row).toMatchObject({
      bucket: 'cotiz-proofs',
      object_key: `unassigned/payment_proof/${ticket.fileId}.pdf`,
      scan_status: 'clean',
      sha256: sha256(PDF),
    });
    expect(await read('cotiz-proofs', row.object_key)).toEqual(PDF);
    expect(await exists('cotiz-proofs', `quarantine/${ticket.fileId}`)).toBe(false);
    expect(clamd.scanned.some((c) => c.equals(PDF))).toBe(true);
  });

  it.each([
    ['une preuve PDF', moussa, 'payment_proof', 'application/pdf'],
    ['un import CSV', awa, 'import_source', 'text/csv'],
  ])('EICAR dans %s → infected et 422 file_not_clean ; rien de conservé', async (_case, headers, purpose, mime) => {
    const content = Buffer.from(EICAR);
    const ticket = await deposit(headers, purpose, mime, content);
    const res = await post(`/uploads/${ticket.fileId}/complete`, headers);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'file_not_clean' });
    const row = await fileRow(ticket.fileId);
    expect(row).toMatchObject({ scan_status: 'infected', sha256: sha256(content) });
    expect(await exists(row.bucket, `quarantine/${ticket.fileId}`)).toBe(false);
  });

  it('type réel différent du type déclaré → infected et 422 file_not_clean', async () => {
    const ticket = await deposit(awa, 'logo', 'image/png', Buffer.concat([PDF, Buffer.alloc(16)]));
    const res = await post(`/uploads/${ticket.fileId}/complete`, awa);
    expect(res.status).toBe(422);
    expect((await fileRow(ticket.fileId)).scan_status).toBe('infected');
  });

  it('photo : EXIF supprimé, miniature créée, taille et empreinte du contenu conservé', async () => {
    const photo = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#e85d04' } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'Moussa', Make: 'Telephone' } } })
      .toBuffer();
    const ticket = await deposit(moussa, 'payment_proof', 'image/jpeg', photo);
    const res = await post(`/uploads/${ticket.fileId}/complete`, moussa);
    const file = StoredFile.parse(await res.json());
    expect(file.scanStatus).toBe('clean');

    const row = await fileRow(ticket.fileId);
    expect(row.object_key).toBe(`unassigned/payment_proof/${ticket.fileId}.jpg`);
    const stored = await read('cotiz-proofs', row.object_key);
    expect((await sharp(stored).metadata()).exif).toBeUndefined();
    expect(row.sha256).toBe(sha256(stored));
    expect(Number(row.size_bytes)).toBe(stored.length);
    expect(file.sizeBytes).toBe(stored.length);
    const thumb = await read('cotiz-proofs', `${row.object_key}.thumb.webp`);
    expect((await sharp(thumb).metadata()).width).toBe(320);
  });

  it('logo d’une association : rangé sous son identifiant', async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#0a3' } })
      .png()
      .toBuffer();
    const ticket = await deposit(awa, 'logo', 'image/png', png);
    expect((await post(`/uploads/${ticket.fileId}/complete`, awa)).status).toBe(202);
    expect((await fileRow(ticket.fileId)).object_key).toBe(`${A.id}/logo/${ticket.fileId}.png`);
  });

  it('analyse plus longue que l’attente : 202 pending ; une confirmation pendant l’analyse n’attend pas son verrou ni ne republie', async () => {
    const marker = '% analyse-lente';
    clamd.delayWhenContains(marker, 12_000);
    const content = Buffer.from(`%PDF-1.4\n${marker}\n%%EOF\n`);
    const ticket = await deposit(moussa, 'payment_proof', 'application/pdf', content);
    const started = Date.now();
    const res = await post(`/uploads/${ticket.fileId}/complete`, moussa);
    expect(res.status).toBe(202);
    expect(StoredFile.parse(await res.json())).toMatchObject({ scanStatus: 'pending', sha256: null });
    expect(Date.now() - started).toBeGreaterThanOrEqual(5_000);

    // L'analyse tient encore le fichier (verrou) : une nouvelle confirmation ne l'attend pas, ne republie rien et,
    // l'analyse durant encore, répond `pending` après l'attente normale.
    const secondStarted = Date.now();
    const second = await post(`/uploads/${ticket.fileId}/complete`, moussa);
    expect(second.status).toBe(202);
    expect(StoredFile.parse(await second.json())).toMatchObject({ scanStatus: 'pending' });
    expect(Date.now() - secondStarted).toBeLessThan(6_000);

    for (let i = 0; i < 60 && (await fileRow(ticket.fileId)).scan_status === 'pending'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const again = await post(`/uploads/${ticket.fileId}/complete`, moussa);
    expect(again.status).toBe(202);
    expect(StoredFile.parse(await again.json())).toMatchObject({ scanStatus: 'clean', sha256: sha256(content) });
    // Une seule analyse.
    expect(clamd.scanned.filter((c) => c.equals(content))).toHaveLength(1);
    const { rows } = await h.superuser(
      "SELECT count(*)::int AS n FROM outbox_events WHERE event_type = 'file.uploaded' AND aggregate_id = $1",
      [ticket.fileId],
    );
    expect(rows[0]).toEqual({ n: 1 });
  }, 40_000);
});
