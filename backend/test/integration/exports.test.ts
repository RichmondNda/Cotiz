import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { EventEnvelope, EventType } from '@cotiz/contracts';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { PurgeExpiredFilesUseCase } from '../../src/modules/files/application/purge-expired-files.use-case.js';
import { NotificationsConsumer } from '../../src/modules/notifications/events/notifications.consumer.js';
import { FailExportUseCase } from '../../src/modules/reporting/application/fail-export.use-case.js';
import { GenerateExportUseCase } from '../../src/modules/reporting/application/generate-export.use-case.js';
import { ExportJobsConsumer } from '../../src/modules/reporting/events/export-jobs.consumer.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../src/shared/queues/index.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type FakeGotenberg, startFakeGotenberg } from '../support/fake-gotenberg.js';
import { startMinio, type TestMinio } from '../support/minio.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { codeOf, PLANS } from './platform-associations.fixture.js';

/**
 * Lot 4.6 · étape 3 : exports asynchrones (rp.export). Demande (quota, fonctionnalité du plan, audit,
 * `export.requested`), production par le worker (mêmes chiffres que rp.report et mb.list ; PDF par Gotenberg),
 * fichier dans cotiz-exports lu par `as.file` pendant 7 jours, `export.completed` → notification du demandeur ;
 * isolation entre associations.
 *
 * Horloge : Date au 2026-11-08 10:00 UTC (qui avance). PROJECTS.a : 25 000 F le 5 de chaque mois depuis mars 2026.
 * Rôles : Awa et Aminata gèrent A ; Koffi gère B et lit A (viewer).
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const BOM = '\ufeff';

interface ExportBody {
  id: string;
  kind: string;
  status: string;
  fileId: string | null;
  createdAt: string;
}

interface OutboxRow {
  id: string;
  event_type: EventType;
  association_id: string | null;
  actor_user_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
}

describe('exports (rp.export)', () => {
  let f: LedgerFixture;
  let minio: TestMinio;
  let s3: S3Client;
  let gotenberg: FakeGotenberg;
  let worker: INestApplicationContext;
  let queue: Queue;

  const request = (body: unknown, options: { aid?: string; token?: string; key?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/exports`, {
      method: 'POST',
      token: options.token ?? f.tokens.awa,
      body,
      headers: { 'idempotency-key': options.key ?? crypto.randomUUID() },
    });
  const requested = async (body: unknown, options: { aid?: string; token?: string } = {}) => {
    const res = await request(body, options);
    expect(res.status).toBe(202);
    return (await res.json()) as ExportBody;
  };
  const read = (id: string, options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/exports/${id}`, { token: options.token ?? f.tokens.awa });
  const statusOf = async (id: string) => {
    const res = await read(id);
    const body = (await res.json()) as ExportBody;
    if (res.status !== 200) throw new Error(`lecture de l’export : ${String(res.status)} ${JSON.stringify(body)}`);
    return body.status;
  };
  const generate = (exportId: string, associationId = A.id) =>
    worker.get(GenerateExportUseCase).execute({ associationId, exportId });
  const produced = async (body: unknown, options: { aid?: string; token?: string } = {}) => {
    const job = await requested(body, options);
    await generate(job.id, options.aid ?? A.id);
    const res = await read(job.id, options);
    expect(res.status).toBe(200);
    return (await res.json()) as ExportBody;
  };
  /**
   * as.file : 302 vers une URL signée ; le contenu est lu directement dans le stockage (l'URL est signée à l'heure
   * simulée du test, déjà échue pour MinIO).
   */
  const download = async (aid: string, fileId: string, token: string) => {
    const res = await fetch(`${f.base}/associations/${aid}/files/${fileId}`, {
      headers: { authorization: `Bearer ${token}` },
      redirect: 'manual',
    });
    if (res.status !== 302) return { status: res.status, text: null, type: null };
    expect(res.headers.get('location')).toContain('cotiz-exports');
    const { bucket, object_key: key } = (
      await f.h.superuser('SELECT bucket, object_key FROM files WHERE id = $1', [fileId])
    ).rows[0] as { bucket: string; object_key: string };
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return {
      status: 302,
      text: (await object.Body?.transformToString('utf8')) ?? null,
      type: object.ContentType ?? null,
    };
  };
  const exists = async (bucket: string, key: string) =>
    s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).then(
      () => true,
      () => false,
    );
  const count = async (sql: string) => (await f.h.superuser(sql)).rowCount;
  const outbox = async (type: EventType) =>
    (
      await f.h.superuser(
        `SELECT id::text, event_type, association_id, actor_user_id, aggregate_type, aggregate_id, payload, occurred_at
           FROM outbox_events WHERE event_type = $1 ORDER BY id`,
        [type],
      )
    ).rows as OutboxRow[];
  const envelopeOf = (r: OutboxRow): EventEnvelope => ({
    id: r.id,
    type: r.event_type,
    version: 1,
    occurredAt: r.occurred_at.toISOString(),
    associationId: r.association_id,
    actorUserId: r.actor_user_id,
    aggregate: { type: r.aggregate_type, id: r.aggregate_id },
    payload: r.payload,
  });

  /** Kofi, inscrit depuis mars : mars et avril validés (50 000 F), mai à octobre en retard ; Moussa, inscrit en novembre. */
  const scenario = async () => {
    const kofi = await f.enrollByApi({
      phone: '+2250711223344',
      firstName: 'Kofi',
      lastName: 'Annan',
      startsFrom: '2026-03-01',
    });
    await f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-11-01' });
    await f.record({
      enrollmentId: kofi.id,
      userId: await f.userOf(kofi.id),
      amount: 50000,
      status: 'validated',
      declaredAt: '2026-04-06T09:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-04-06T15:00:00Z',
      lines: [
        { installmentId: await f.installmentOf(kofi.id, '2026-03-05'), amount: 25000, state: 'confirmed' },
        { installmentId: await f.installmentOf(kofi.id, '2026-04-05'), amount: 25000, state: 'confirmed' },
      ],
    });
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    [minio, gotenberg] = await Promise.all([startMinio(), startFakeGotenberg()]);
    const storage = {
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY_ID: minio.accessKeyId,
      S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
    };
    s3 = new S3Client({
      endpoint: minio.endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: minio.accessKeyId, secretAccessKey: minio.secretAccessKey },
    });
    f = await startLedgerFixture(storage);
    worker = await NestFactory.createApplicationContext(
      WorkerModule.register(
        loadConfig({
          NODE_ENV: 'test',
          DATABASE_URL: f.h.db.urlFor('cotiz_app'),
          REDIS_URL: f.redis.getConnectionUrl(),
          OUTBOX_RELAY_INTERVAL_MS: '0',
          GOTENBERG_URL: gotenberg.url,
          ...storage,
        }),
      ),
      { logger: false },
    );
    queue = new Queue(QUEUES.exports.name, {
      connection: redisConnection(f.redis.getConnectionUrl()),
      prefix: REDIS_PREFIX,
    });
    await f.h.superuser('UPDATE plans SET features = $2 WHERE id = ANY($1)', [
      [PLANS.essentiel, PLANS.pro],
      ['exports'],
    ]);
  });

  afterAll(async () => {
    s3.destroy();
    await queue.close();
    await worker.close();
    await f.stop();
    await Promise.all([minio.stop(), gotenberg.close()]);
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await f.h.superuser(
      `BEGIN; SET LOCAL session_replication_role = replica;
       DELETE FROM export_jobs; DELETE FROM files WHERE purpose = 'export';
       DELETE FROM outbox_events WHERE event_type LIKE 'export.%';
       DELETE FROM notifications WHERE type = 'export.completed'; COMMIT;`,
    );
    await f.resetLedger();
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
  });

  describe('demande', () => {
    it('202, en attente, audité, export.requested dans la même transaction', async () => {
      const job = await requested({ kind: 'project_report_csv', projectId: PROJECTS.a });
      expect(job).toMatchObject({ kind: 'project_report_csv', status: 'queued', fileId: null });
      const events = await outbox('export.requested');
      expect(events.map((e) => [e.association_id, e.actor_user_id, e.payload])).toEqual([
        [A.id, USERS.awa, { exportId: job.id }],
      ]);
      const audit = (
        await f.h.superuser(
          `SELECT entity_id::text, association_id::text, actor_user_id::text FROM audit_logs
            WHERE action = 'export.request'`,
        )
      ).rows;
      expect(audit).toEqual([{ entity_id: job.id, association_id: A.id, actor_user_id: USERS.awa }]);
    });

    it('rapport sans projet : 422 ; projet inconnu ou d’une autre association : 404 ; période inversée : 422', async () => {
      expect((await request({ kind: 'project_report_pdf' })).status).toBe(422);
      expect((await request({ kind: 'project_report_csv', projectId: crypto.randomUUID() })).status).toBe(404);
      expect((await request({ kind: 'project_report_csv', projectId: PROJECTS.b })).status).toBe(404);
      const inverted = await request({
        kind: 'project_report_csv',
        projectId: PROJECTS.a,
        from: '2026-06-01',
        to: '2026-01-01',
      });
      expect(inverted.status).toBe(422);
      expect(await count('SELECT 1 FROM export_jobs')).toBe(0);
    });

    it('fonctionnalité absente du plan : 403 feature_disabled', async () => {
      await f.h.superuser('UPDATE plans SET features = $2 WHERE id = $1', [PLANS.essentiel, []]);
      try {
        const res = await request({ kind: 'members_csv' });
        expect(res.status).toBe(403);
        expect(await codeOf(res)).toBe('feature_disabled');
      } finally {
        await f.h.superuser('UPDATE plans SET features = $2 WHERE id = $1', [PLANS.essentiel, ['exports']]);
      }
    });

    it('un export déjà en attente : 409 quota_exceeded (limite 1), puis accepté une fois produit', async () => {
      const first = await requested({ kind: 'members_csv' });
      const again = await request({ kind: 'members_csv' });
      expect(again.status).toBe(409);
      expect(await again.json()).toMatchObject({ code: 'quota_exceeded', limit: 1, usage: 1 });
      await generate(first.id);
      expect((await request({ kind: 'members_csv' })).status).toBe(202);
    });

    it('deux demandes simultanées (clés différentes) : une seule acceptée', async () => {
      const both = await Promise.all([request({ kind: 'members_csv' }), request({ kind: 'members_csv' })]);
      expect(both.map((r) => r.status).sort()).toEqual([202, 409]);
      expect(await count('SELECT 1 FROM export_jobs')).toBe(1);
    });

    it('20 exports demandés aujourd’hui : 409 (limite 20) ; ceux de la veille ne comptent pas', async () => {
      const insert = (n: number, at: string) =>
        f.h.superuser(
          `INSERT INTO export_jobs (id, association_id, requested_by, kind, status, created_at)
           SELECT gen_random_uuid(), $1, $2, 'members_csv', 'done', $3::timestamptz FROM generate_series(1, $4::int)`,
          [A.id, USERS.awa, at, n],
        );
      await insert(19, '2026-11-08T00:30:00Z');
      await insert(5, '2026-11-07T23:30:00Z');
      const job = await requested({ kind: 'members_csv' });
      await generate(job.id);
      const res = await request({ kind: 'members_csv' });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: 'quota_exceeded', limit: 20, usage: 20 });
    });

    it('rejouée avec la même clé : le même export, une seule ligne', async () => {
      const key = crypto.randomUUID();
      const first = await request({ kind: 'members_csv' }, { key });
      const second = await request({ kind: 'members_csv' }, { key });
      expect(second.status).toBe(first.status);
      expect(((await second.json()) as ExportBody).id).toBe(((await first.json()) as ExportBody).id);
      expect(await count('SELECT 1 FROM export_jobs')).toBe(1);
    });
  });

  describe('production', () => {
    it('état des cotisations en CSV : mêmes chiffres que rp.report, fichier de 7 jours, export.completed', async () => {
      await scenario();
      const job = await produced({ kind: 'project_report_csv', projectId: PROJECTS.a });
      expect(job.status).toBe('done');
      const file = await download(A.id, job.fileId ?? '', f.tokens.awa);
      expect(file.status).toBe(302);
      expect(file.type).toContain('text/csv');
      const lines = (file.text ?? '').replace(BOM, '').split('\r\n');
      expect(lines[0]).toBe('"Souscripteur";"Attendu à date (F)";"Versé (F)";"Reste (F)";"Retards";"Dernier paiement"');
      expect(lines.find((l) => l.startsWith('"Kofi Annan"'))).toBe(
        '"Kofi Annan";"225000";"50000";"175000";"6";"06/04/2026"',
      );
      expect(lines).toHaveLength(4);

      const report = (await (
        await f.call(`/associations/${A.id}/projects/${PROJECTS.a}/report`, { token: f.tokens.awa })
      ).json()) as { rows: { paid: { amount: number } }[] };
      const paidInCsv = lines.slice(1, -1).map((l) => Number(l.split(';')[2]?.replaceAll('"', '')));
      expect(paidInCsv.reduce((a, b) => a + b, 0)).toBe(report.rows.reduce((a, r) => a + r.paid.amount, 0));

      const row = (
        await f.h.superuser(
          `SELECT purpose, bucket, scan_status, owner_user_id::text, sha256 IS NOT NULL AS hashed,
                  round(extract(epoch FROM expires_at - created_at) / 3600)::int AS hours
             FROM files WHERE id = $1`,
          [job.fileId],
        )
      ).rows[0] as Record<string, unknown>;
      expect(row).toEqual({
        purpose: 'export',
        bucket: 'cotiz-exports',
        scan_status: 'clean',
        owner_user_id: USERS.awa,
        hashed: true,
        hours: 168,
      });
      const completed = await outbox('export.completed');
      expect(completed.map((e) => [e.association_id, e.actor_user_id, e.payload])).toEqual([
        [A.id, USERS.awa, { exportId: job.id, fileId: job.fileId }],
      ]);
    });

    it('période : seules les échéances de la période comptent', async () => {
      await scenario();
      const job = await produced({
        kind: 'project_report_csv',
        projectId: PROJECTS.a,
        from: '2026-03-01',
        to: '2026-04-30',
      });
      const file = await download(A.id, job.fileId ?? '', f.tokens.awa);
      expect(file.text).toContain('"Kofi Annan";"50000";"50000";"0";"0";"06/04/2026"');
    });

    it('rapport en PDF : rendu par Gotenberg (noms et date), stocké en PDF', async () => {
      await scenario();
      const before = gotenberg.requests.length;
      const job = await produced({ kind: 'project_report_pdf', projectId: PROJECTS.a });
      const sent = gotenberg.requests.slice(before);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.html).toContain('Kofi Annan');
      expect(sent[0]?.html).toContain('Établi le 8 novembre 2026');
      const file = await download(A.id, job.fileId ?? '', f.tokens.awa);
      expect(file.type).toBe('application/pdf');
      expect(file.text?.startsWith('%PDF-')).toBe(true);
    });

    it('annuaire en CSV : une ligne par personne, statut en toutes lettres', async () => {
      await scenario();
      const job = await produced({ kind: 'members_csv' });
      const lines = ((await download(A.id, job.fileId ?? '', f.tokens.awa)).text ?? '').split('\r\n');
      expect(lines[0]).toContain('"Statut global"');
      const kofi = lines.find((l) => l.startsWith('"Kofi Annan"'));
      expect(kofi).toContain('"+2250711223344"');
      expect(kofi).toContain('"En retard"');
      expect(lines.filter((l) => l.length > 0)).toHaveLength(3);
    });

    it('rejouée après production : rien de plus (un fichier, un événement)', async () => {
      const job = await produced({ kind: 'members_csv' });
      await generate(job.id);
      expect(await count(`SELECT 1 FROM files WHERE purpose = 'export'`)).toBe(1);
      expect(await outbox('export.completed')).toHaveLength(1);
    });

    it('demandeur qui ne gère plus l’association : export en échec, aucun fichier', async () => {
      const job = await requested({ kind: 'members_csv' }, { token: f.tokens.aminata });
      const membership = (status: string) =>
        f.h.superuser(`UPDATE memberships SET status = $3 WHERE association_id = $1 AND user_id = $2`, [
          A.id,
          USERS.aminata,
          status,
        ]);
      await membership('removed');
      try {
        await generate(job.id);
      } finally {
        await membership('active');
      }
      expect(await statusOf(job.id)).toBe('failed');
      expect(await count(`SELECT 1 FROM files WHERE purpose = 'export'`)).toBe(0);
    });

    it('tentatives épuisées : en échec ; un export déjà produit le reste', async () => {
      const job = await requested({ kind: 'members_csv' });
      await worker.get(FailExportUseCase).execute({ associationId: A.id, exportId: job.id });
      expect(await statusOf(job.id)).toBe('failed');
      const done = await produced({ kind: 'members_csv' });
      await worker.get(FailExportUseCase).execute({ associationId: A.id, exportId: done.id });
      expect(await statusOf(done.id)).toBe('done');
    });

    it('moteur PDF indisponible : le job échoue (repris par la file), l’export reste en cours', async () => {
      const job = await requested({ kind: 'project_report_pdf', projectId: PROJECTS.a });
      gotenberg.failNext(1);
      await expect(generate(job.id)).rejects.toThrow();
      expect(await statusOf(job.id)).toBe('running');
      await generate(job.id);
      expect(await statusOf(job.id)).toBe('done');
    });
  });

  describe('expiration', () => {
    it('après 7 jours : plus servi (404), puis purgé (ligne et objet)', async () => {
      const job = await produced({ kind: 'members_csv' });
      const { object_key: key } = (await f.h.superuser('SELECT object_key FROM files WHERE id = $1', [job.fileId]))
        .rows[0] as { object_key: string };
      expect(await exists('cotiz-exports', key)).toBe(true);
      // Horloge de l'application (simulée), pas celle de la base.
      await f.h.superuser('UPDATE files SET expires_at = $2 WHERE id = $1', [
        job.fileId,
        new Date(Date.now() - 60_000),
      ]);
      expect((await download(A.id, job.fileId ?? '', f.tokens.awa)).status).toBe(404);
      await worker.get(PurgeExpiredFilesUseCase).execute(new Date());
      expect(await count(`SELECT 1 FROM files WHERE purpose = 'export'`)).toBe(0);
      expect(await exists('cotiz-exports', key)).toBe(false);
    });

    it('un export encore valide n’est pas purgé', async () => {
      const job = await produced({ kind: 'members_csv' });
      await worker.get(PurgeExpiredFilesUseCase).execute(new Date());
      expect((await download(A.id, job.fileId ?? '', f.tokens.awa)).status).toBe(302);
    });
  });

  describe('file et notification', () => {
    it('export.requested → un job de la file exports par événement (relais rejoué écarté)', async () => {
      const job = await requested({ kind: 'members_csv' });
      const [event] = await outbox('export.requested');
      if (!event) throw new Error('événement absent');
      const consumer = worker.get(ExportJobsConsumer);
      await consumer.handle(envelopeOf(event));
      await consumer.handle(envelopeOf(event));
      const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed']);
      const ours = jobs.filter((j) => (j.data as { exportId?: string }).exportId === job.id);
      expect(ours.map((j) => j.id)).toEqual([`export-${event.id}`]);
      expect(ours[0]?.data).toMatchObject({ associationId: A.id, exportId: job.id });
    });

    it('export.completed → le demandeur seul, lien vers les rapports du projet, une seule fois', async () => {
      const job = await produced({ kind: 'project_report_csv', projectId: PROJECTS.a }, { token: f.tokens.aminata });
      for (const event of await outbox('export.completed')) {
        await worker.get(NotificationsConsumer).handle(envelopeOf(event));
        await worker.get(NotificationsConsumer).handle(envelopeOf(event));
      }
      const bells = (
        await f.h.superuser(
          `SELECT user_id::text, association_id::text, title, action_url, data->>'fileId' AS file_id
             FROM notifications WHERE type = 'export.completed'`,
        )
      ).rows;
      expect(bells).toEqual([
        {
          user_id: USERS.aminata,
          association_id: A.id,
          title: 'Export prêt',
          action_url: `/asso/projets/${PROJECTS.a}/rapports`,
          file_id: job.fileId,
        },
      ]);
    });

    it('enveloppe falsifiée (association B, export de A) : aucune notification', async () => {
      const job = await produced({ kind: 'members_csv' });
      await worker.get(NotificationsConsumer).handle({
        id: crypto.randomUUID(),
        type: 'export.completed',
        version: 1,
        occurredAt: new Date().toISOString(),
        associationId: B.id,
        actorUserId: USERS.awa,
        aggregate: { type: 'export', id: job.id },
        payload: { exportId: job.id, fileId: job.fileId },
      });
      expect(await count(`SELECT 1 FROM notifications WHERE type = 'export.completed'`)).toBe(0);
    });
  });

  describe('isolation', () => {
    it('l’export de A ne se lit ni ne se produit depuis B ; son fichier ne s’ouvre pas depuis B', async () => {
      const job = await produced({ kind: 'members_csv' });
      // Koffi gère B (et lit A) : par B, l'export et le fichier de A n'existent pas.
      expect((await read(job.id, { aid: B.id, token: f.tokens.koffi })).status).toBe(404);
      expect((await download(B.id, job.fileId ?? '', f.tokens.koffi)).status).toBe(404);
      // Produire un export de A dans le contexte de B : rien.
      const other = await requested({ kind: 'members_csv' });
      await generate(other.id, B.id);
      expect(await statusOf(other.id)).toBe('queued');
    });

    it('sans gestion dans B (Awa n’y est que souscriptrice) : ni demande ni lecture ; l’export de B absent de A', async () => {
      const ofB = await requested({ kind: 'members_csv' }, { aid: B.id, token: f.tokens.koffi });
      expect((await read(ofB.id, { aid: B.id })).status).toBe(404);
      expect((await request({ kind: 'members_csv' }, { aid: B.id })).status).toBe(404);
      expect((await read(ofB.id)).status).toBe(404);
    });
  });
});
