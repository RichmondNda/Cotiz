import { APP_GUARD } from '@nestjs/core';
import { type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { StoredFile, UPLOAD_MAX_BYTES, UploadTicket } from '@cotiz/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { AppModule } from '../../src/app.module.js';
import { loadConfig } from '../../src/config.js';
import { A, B, type IsolationHarness, startIsolationHarness, USERS } from '../isolation/harness.js';
import { startMinio, type TestMinio } from '../support/minio.js';
import { as, TestAuthGuard } from '../support/test-auth.js';

/**
 * fl.upload et fl.get contre de vrais PostgreSQL et MinIO (lot 0.5, étape 3) : dépôt direct par URL présignée,
 * confirmation, puis lecture par URL signée. Authentification : garde de test (le lot 1.1 apporte la vraie).
 */

type Ticket = z.infer<typeof UploadTicket>;

const PDF = Buffer.from('%PDF-1.4\n% preuve de paiement\n%%EOF\n');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

const moussa = as({ space: 'subscriber', userId: USERS.moussa, role: 'subscriber' });
const fatou = as({ space: 'subscriber', userId: USERS.fatou, role: 'subscriber' });
const awaManagerOfA = as({ space: 'association', associationId: A.id, userId: USERS.awa, role: 'owner' });
const koffiManagerOfB = as({ space: 'association', associationId: B.id, userId: USERS.koffi, role: 'owner' });

describe('fl.upload et fl.get (MinIO réel)', () => {
  let h: IsolationHarness;
  let minio: TestMinio;
  let app: INestApplication;
  let base: string;

  const post = (path: string, headers: Record<string, string>, body?: unknown) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const requestUpload = async (headers: Record<string, string>, body: Record<string, unknown>) => {
    const res = await post('/uploads', headers, body);
    expect(res.status).toBe(201);
    return UploadTicket.parse(await res.json());
  };

  const putFile = (ticket: Ticket, content: Buffer, headers: Record<string, string> = ticket.headers) =>
    fetch(ticket.uploadUrl, { method: 'PUT', headers, body: content });

  /** Dépôt complet d'une preuve (demande, dépôt, confirmation). */
  async function uploadProof(headers = moussa, content = PDF): Promise<string> {
    const ticket = await requestUpload(headers, {
      purpose: 'payment_proof',
      fileName: 'reçu orange money.pdf',
      mimeType: 'application/pdf',
      sizeBytes: content.length,
    });
    expect((await putFile(ticket, content)).status).toBe(200);
    expect((await post(`/uploads/${ticket.fileId}/complete`, headers)).status).toBe(202);
    return ticket.fileId;
  }

  /** L'analyse arrive à l'étape 4 : le test pose le résultat comme le fera le worker. */
  const markClean = (id: string) =>
    h.superuser(`UPDATE files SET scan_status = 'clean', sha256 = repeat('a', 64) WHERE id = $1`, [id]);

  const getFile = (id: string, headers: Record<string, string>) =>
    fetch(`${base}/files/${id}`, { headers, redirect: 'manual' });

  beforeAll(async () => {
    [h, minio] = await Promise.all([startIsolationHarness('migrated'), startMinio()]);
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      REDIS_URL: 'redis://127.0.0.1:1',
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY_ID: minio.accessKeyId,
      S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
    });
    @Module({ imports: [AppModule.register(config)], providers: [{ provide: APP_GUARD, useClass: TestAuthGuard }] })
    class TestRoot {}
    app = await NestFactory.create(TestRoot, { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([h.stop(), minio.stop()]);
  });

  describe('POST /uploads', () => {
    it('crée le fichier en attente et renvoie une URL de dépôt de 5 min sous quarantine/', async () => {
      const before = Date.now();
      const ticket = await requestUpload(moussa, {
        purpose: 'payment_proof',
        fileName: 'reçu.pdf',
        mimeType: 'application/pdf',
        sizeBytes: PDF.length,
      });
      expect(ticket.method).toBe('PUT');
      expect(ticket.headers).toEqual({ 'content-type': 'application/pdf' });
      const url = new URL(ticket.uploadUrl);
      expect(`${url.protocol}//${url.host}`).toBe(minio.endpoint);
      expect(url.pathname).toBe(`/cotiz-proofs/quarantine/${ticket.fileId}`);
      expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
      const expiresIn = Date.parse(ticket.expiresAt) - before;
      expect(expiresIn).toBeGreaterThan(290_000);
      expect(expiresIn).toBeLessThanOrEqual(301_000);

      const { rows } = await h.superuser('SELECT * FROM files WHERE id = $1', [ticket.fileId]);
      expect(rows[0]).toMatchObject({
        association_id: null,
        owner_user_id: USERS.moussa,
        purpose: 'payment_proof',
        bucket: 'cotiz-proofs',
        object_key: `quarantine/${ticket.fileId}`,
        original_name: 'reçu.pdf',
        mime_type: 'application/pdf',
        size_bytes: String(PDF.length),
        sha256: null,
        scan_status: 'pending',
      });
    });

    it('logo d’une association : compartiment cotiz-media, association du contexte', async () => {
      const ticket = await requestUpload(awaManagerOfA, {
        purpose: 'logo',
        fileName: 'logo.png',
        mimeType: 'image/png',
        sizeBytes: PNG.length,
      });
      expect(new URL(ticket.uploadUrl).pathname).toBe(`/cotiz-media/quarantine/${ticket.fileId}`);
      const { rows } = await h.superuser('SELECT association_id, owner_user_id FROM files WHERE id = $1', [
        ticket.fileId,
      ]);
      expect(rows[0]).toEqual({ association_id: A.id, owner_user_id: USERS.awa });
    });

    it.each([
      ['trop lourd', { mimeType: 'application/pdf', sizeBytes: UPLOAD_MAX_BYTES + 1 }, 'file_too_large'],
      ['type refusé', { mimeType: 'image/gif', sizeBytes: 10 }, 'file_type_not_allowed'],
    ])('%s → 422 %s (problem+json)', async (_case, patch, code) => {
      const res = await post('/uploads', moussa, { purpose: 'payment_proof', fileName: 'x', ...patch });
      expect(res.status).toBe(422);
      expect(res.headers.get('content-type')).toContain('application/problem+json');
      expect(await res.json()).toMatchObject({ status: 422, code });
    });

    it.each(['contract_pdf', 'invoice_pdf', 'export'])(
      '%s, produit par le serveur, n’est jamais déposé',
      async (purpose) => {
        const res = await post('/uploads', awaManagerOfA, {
          purpose,
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
        });
        expect(res.status).toBe(422);
        expect(await res.json()).toMatchObject({ code: 'file_type_not_allowed' });
      },
    );

    it('corps invalide → 422 validation_failed, avec les champs en cause', async () => {
      const res = await post('/uploads', moussa, { purpose: 'payment_proof', mimeType: 'application/pdf' });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { code: string; fields: Record<string, string> };
      expect(body.code).toBe('validation_failed');
      expect(Object.keys(body.fields).sort()).toEqual(['fileName', 'sizeBytes']);
    });

    it('sans authentification → 401 session_expired', async () => {
      const res = await post(
        '/uploads',
        {},
        { purpose: 'payment_proof', fileName: 'x', mimeType: 'image/png', sizeBytes: 1 },
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: 'session_expired' });
    });

    it.each([
      ['un souscripteur ne dépose pas de logo', moussa, 'logo', 'image/png'],
      ['un gestionnaire ne dépose pas de preuve de paiement', awaManagerOfA, 'payment_proof', 'application/pdf'],
    ])('%s → 403 forbidden', async (_case, headers, purpose, mimeType) => {
      const res = await post('/uploads', headers, { purpose, fileName: 'x', mimeType, sizeBytes: 10 });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: 'forbidden' });
    });
  });

  describe('dépôt direct dans MinIO', () => {
    it('MinIO refuse un contenu d’une autre taille ou d’un autre type que ceux déclarés', async () => {
      const ticket = await requestUpload(moussa, {
        purpose: 'payment_proof',
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        sizeBytes: PDF.length,
      });
      expect((await putFile(ticket, Buffer.concat([PDF, PDF]))).status).toBe(403);
      expect((await putFile(ticket, PDF, { 'content-type': 'text/html' })).status).toBe(403);
      expect((await putFile(ticket, PDF)).status).toBe(200);
    });
  });

  describe('POST /uploads/{id}/complete', () => {
    it('confirme le dépôt : 202 en attente d’analyse et événement file.uploaded', async () => {
      const ticket = await requestUpload(moussa, {
        purpose: 'payment_proof',
        fileName: 'reçu.pdf',
        mimeType: 'application/pdf',
        sizeBytes: PDF.length,
      });
      await putFile(ticket, PDF);
      const res = await post(`/uploads/${ticket.fileId}/complete`, moussa);
      expect(res.status).toBe(202);
      expect(StoredFile.parse(await res.json())).toMatchObject({
        id: ticket.fileId,
        purpose: 'payment_proof',
        fileName: 'reçu.pdf',
        mimeType: 'application/pdf',
        sizeBytes: PDF.length,
        sha256: null,
        scanStatus: 'pending',
      });
      const { rows } = await h.superuser(
        `SELECT association_id, actor_user_id, aggregate_type, aggregate_id, payload FROM outbox_events
          WHERE event_type = 'file.uploaded' AND aggregate_id = $1`,
        [ticket.fileId],
      );
      expect(rows).toEqual([
        {
          association_id: null,
          actor_user_id: USERS.moussa,
          aggregate_type: 'file',
          aggregate_id: ticket.fileId,
          payload: { fileId: ticket.fileId, purpose: 'payment_proof' },
        },
      ]);
    });

    it('fichier non déposé → 409 invalid_state, aucun événement', async () => {
      const ticket = await requestUpload(moussa, {
        purpose: 'payment_proof',
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        sizeBytes: PDF.length,
      });
      const res = await post(`/uploads/${ticket.fileId}/complete`, moussa);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: 'invalid_state' });
      const { rows } = await h.superuser('SELECT 1 FROM outbox_events WHERE aggregate_id = $1', [ticket.fileId]);
      expect(rows).toEqual([]);
    });

    it('identifiant inconnu → 404', async () => {
      const res = await post('/uploads/00000000-0000-7000-8000-00000000ffff/complete', moussa);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /files/{id}', () => {
    it('302 vers une URL signée de 5 min, qui sert le fichier ; consultation auditée', async () => {
      const id = await uploadProof();
      await markClean(id);
      const res = await getFile(id, moussa);
      expect(res.status).toBe(302);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const location = new URL(res.headers.get('location') ?? '');
      expect(location.searchParams.get('X-Amz-Expires')).toBe('300');
      const download = await fetch(location);
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer())).toEqual(PDF);
      expect(download.headers.get('content-type')).toBe('application/pdf');
      expect(download.headers.get('content-disposition')).toBe(
        `attachment; filename="re_u orange money.pdf"; filename*=UTF-8''re%C3%A7u%20orange%20money.pdf`,
      );
      const { rows } = await h.superuser(
        `SELECT actor_user_id, actor_role, association_id, entity_type FROM audit_logs
          WHERE action = 'file.read' AND entity_id = $1`,
        [id],
      );
      expect(rows).toEqual([
        { actor_user_id: USERS.moussa, actor_role: 'subscriber', association_id: null, entity_type: 'file' },
      ]);
    });

    it('fichier en attente d’analyse ou infecté → 404', async () => {
      const id = await uploadProof();
      expect((await getFile(id, moussa)).status).toBe(404);
      await h.superuser(`UPDATE files SET scan_status = 'infected', sha256 = repeat('b', 64) WHERE id = $1`, [id]);
      expect((await getFile(id, moussa)).status).toBe(404);
    });
  });

  describe('isolation des endpoints', () => {
    it('un souscripteur ne lit ni ne confirme le fichier d’un autre (404)', async () => {
      const id = await uploadProof(moussa);
      await markClean(id);
      expect((await getFile(id, fatou)).status).toBe(404);
      expect((await post(`/uploads/${id}/complete`, fatou)).status).toBe(404);
    });

    it('le logo de A : lisible par A, introuvable pour B (404)', async () => {
      const ticket = await requestUpload(awaManagerOfA, {
        purpose: 'logo',
        fileName: 'logo.png',
        mimeType: 'image/png',
        sizeBytes: PNG.length,
      });
      await putFile(ticket, PNG);
      expect((await post(`/uploads/${ticket.fileId}/complete`, koffiManagerOfB)).status).toBe(404);
      expect((await post(`/uploads/${ticket.fileId}/complete`, awaManagerOfA)).status).toBe(202);
      await markClean(ticket.fileId);
      expect((await getFile(ticket.fileId, awaManagerOfA)).status).toBe(302);
      expect((await getFile(ticket.fileId, koffiManagerOfB)).status).toBe(404);
    });

    it('un gestionnaire, hors du contexte de son association, ne lit ni ne confirme ce qu’il y a déposé', async () => {
      const ticket = await requestUpload(awaManagerOfA, {
        purpose: 'logo',
        fileName: 'logo.png',
        mimeType: 'image/png',
        sizeBytes: PNG.length,
      });
      await putFile(ticket, PNG);
      const awaSubscriber = as({ space: 'subscriber', userId: USERS.awa, role: 'subscriber' });
      const awaInB = as({ space: 'association', associationId: B.id, userId: USERS.awa, role: 'manager' });
      for (const headers of [awaSubscriber, awaInB]) {
        expect((await post(`/uploads/${ticket.fileId}/complete`, headers)).status).toBe(404);
      }
      expect((await post(`/uploads/${ticket.fileId}/complete`, awaManagerOfA)).status).toBe(202);
      await markClean(ticket.fileId);
      for (const headers of [awaSubscriber, awaInB]) expect((await getFile(ticket.fileId, headers)).status).toBe(404);
    });

    it('sans authentification : 401, jamais le fichier', async () => {
      const id = await uploadProof();
      await markClean(id);
      expect((await getFile(id, {})).status).toBe(401);
    });
  });
});
