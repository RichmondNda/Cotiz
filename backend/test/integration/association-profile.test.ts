import { Association, StoredFile, UploadTicket } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { startMinio, type TestMinio } from '../support/minio.js';
import { codeOf, D, OWNERS, type PlatformFixture, startPlatformFixture } from './platform-associations.fixture.js';

/**
 * Lot 2.1 · étape 1 : profil de l'association par son gestionnaire (as.get, as.patch) et logo déposé sous l'URL de
 * l'association (as.upload, as.file, décision 24). Vérification de l'étape : 412 sur modification concurrente.
 * Isolation : une autre association, ou une personne qui n'y est que souscriptrice, reçoit 404 ; seul l'owner modifie.
 */

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describe('profil de l’association (as.get, as.patch, as.upload, as.file)', () => {
  let f: PlatformFixture;
  let minio: TestMinio;
  /** Owner de A (souscriptrice de B). */
  let awa: string;
  /** Owner de B, viewer de A. */
  let koffi: string;
  /** Owner de D (onboarding). */
  let yao: string;
  /** Souscripteur de A. */
  let moussa: string;

  const patch = (aid: string, body: unknown, version: number | null, token = awa) =>
    f.call(`/associations/${aid}`, {
      token,
      method: 'PATCH',
      body,
      headers: version === null ? {} : { 'if-match': `W/"${String(version)}"` },
    });
  const row = async (id: string) =>
    (
      await f.h.superuser(
        'SELECT name, city, description, contact_email, logo_file_id, default_grace_days, version FROM associations WHERE id = $1',
        [id],
      )
    ).rows[0] as Record<string, unknown>;
  const events = async (id: string) =>
    (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, payload FROM outbox_events
          WHERE event_type = 'association.updated' AND aggregate_id = $1 ORDER BY id`,
        [id],
      )
    ).rows as { association_id: string; actor_user_id: string; payload: unknown }[];

  /** Logo déposé dans l'association (demande, dépôt MinIO, confirmation) ; `clean` : analyse posée comme le worker. */
  async function uploadLogo(aid: string, token: string, clean = true): Promise<string> {
    const res = await f.call(`/associations/${aid}/uploads`, {
      token,
      method: 'POST',
      body: { purpose: 'logo', fileName: 'logo.png', mimeType: 'image/png', sizeBytes: PNG.length },
    });
    expect(res.status).toBe(201);
    const ticket = UploadTicket.parse(await res.json());
    expect((await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: PNG })).status).toBe(200);
    const done = await f.call(`/associations/${aid}/uploads/${ticket.fileId}/complete`, { token, method: 'POST' });
    expect(done.status).toBe(202);
    expect(StoredFile.parse(await done.json())).toMatchObject({ id: ticket.fileId, purpose: 'logo' });
    if (clean) {
      await f.h.superuser(`UPDATE files SET scan_status = 'clean', sha256 = repeat('a', 64) WHERE id = $1`, [
        ticket.fileId,
      ]);
    }
    return ticket.fileId;
  }

  beforeAll(async () => {
    minio = await startMinio();
    f = await startPlatformFixture([], {
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY_ID: minio.accessKeyId,
      S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
      // Pas de worker : la confirmation répond `pending`, le test pose le résultat de l'analyse.
      FILE_SCAN_WAIT_MS: '0',
    });
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       VALUES (gen_random_uuid(), $1, $2, 'viewer', 'active', now())`,
      [A.id, USERS.koffi],
    );
    [awa, koffi, yao, moussa] = await Promise.all([
      f.login('association', 'awa@test.cotiz.app'),
      f.login('association', 'koffi@test.cotiz.app'),
      f.login('association', OWNERS.yao.email),
      f.login('subscriber', 'moussa@test.cotiz.app'),
    ]);
  });

  afterAll(async () => {
    await f.stop();
    await minio.stop();
  });

  beforeEach(async () => {
    await f.h.superuser(
      `UPDATE associations SET name = 'Entraide Yopougon', city = 'Abidjan', description = NULL,
         contact_email = 'contact@ey.ci', logo_file_id = NULL, default_grace_days = 5, version = 1,
         onboarding_completed_at = '2026-09-02T10:30:00Z' WHERE id = $1`,
      [A.id],
    );
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type = 'association.updated'`);
  });

  describe('as.get', () => {
    it('owner : profil conforme au contrat, onboarding terminé ou non', async () => {
      const res = await f.call(`/associations/${A.id}`, { token: awa });
      expect(res.status).toBe(200);
      expect(Association.parse(await res.json())).toEqual({
        id: A.id,
        slug: 'entraide-yopougon',
        name: 'Entraide Yopougon',
        type: 'entraide',
        city: 'Abidjan',
        country: 'CI',
        description: null,
        logoFileId: null,
        contactEmail: 'contact@ey.ci',
        contactPhone: '+2250700000000',
        status: 'active',
        currency: 'XOF',
        timezone: 'Africa/Abidjan',
        defaultGraceDays: 5,
        onboardingCompletedAt: '2026-09-02T10:30:00.000Z',
        version: 1,
      });
      const d = Association.parse(await (await f.call(`/associations/${D}`, { token: yao })).json());
      expect(d).toMatchObject({ status: 'onboarding', onboardingCompletedAt: null });
    });

    it('viewer : lecture permise', async () => {
      expect((await f.call(`/associations/${A.id}`, { token: koffi })).status).toBe(200);
    });

    it('isolation : association d’un autre gestionnaire, ou dont on n’est que souscripteur → 404', async () => {
      // Awa est souscriptrice de B, pas gestionnaire ; Yao ne connaît pas A.
      expect(await codeOf(await f.call(`/associations/${B.id}`, { token: awa }))).toBe('not_found');
      expect((await f.call(`/associations/${A.id}`, { token: yao })).status).toBe(404);
      expect((await f.call('/associations/00000000-0000-7000-8000-0000000000ff', { token: awa })).status).toBe(404);
    });

    it('jeton souscripteur : 404, comme toute route d’association (memberships.test.ts)', async () => {
      expect((await f.call(`/associations/${A.id}`, { token: moussa })).status).toBe(404);
    });
  });

  describe('as.patch', () => {
    it('seuls les champs envoyés changent ; version incrémentée, ETag', async () => {
      const res = await patch(A.id, { city: 'Yopougon', description: 'Entraide des familles', defaultGraceDays: 7 }, 1);
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBe('W/"2"');
      expect(Association.parse(await res.json())).toMatchObject({
        name: 'Entraide Yopougon',
        city: 'Yopougon',
        description: 'Entraide des familles',
        defaultGraceDays: 7,
        version: 2,
      });
      expect(await row(A.id)).toMatchObject({
        name: 'Entraide Yopougon',
        contact_email: 'contact@ey.ci',
        city: 'Yopougon',
        default_grace_days: 7,
        version: 2,
      });
    });

    it('aucune valeur changée : version incrémentée, aucun événement', async () => {
      const res = await patch(A.id, { name: 'Entraide Yopougon' }, 1);
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBe('W/"2"');
      expect(await row(A.id)).toMatchObject({ name: 'Entraide Yopougon', version: 2 });
      expect(await events(A.id)).toEqual([]);
    });

    it('association.updated : champs réellement modifiés, association et auteur', async () => {
      await patch(A.id, { name: 'Entraide Yopougon', city: 'Yopougon' }, 1);
      expect(await events(A.id)).toEqual([
        { association_id: A.id, actor_user_id: USERS.awa, payload: { associationId: A.id, changedFields: ['city'] } },
      ]);
    });

    it('modification concurrente : 412 version_conflict, rien n’est modifié, ni événement', async () => {
      expect((await patch(A.id, { city: 'Yopougon' }, 1)).status).toBe(200);
      const res = await patch(A.id, { city: 'Cocody' }, 1);
      expect(res.status).toBe(412);
      expect(await codeOf(res)).toBe('version_conflict');
      expect(await row(A.id)).toMatchObject({ city: 'Yopougon', version: 2 });
      expect(await events(A.id)).toHaveLength(1);
    });

    it('If-Match absent : 422 ; corps vide : 422 ; rien n’est modifié', async () => {
      const missing = await patch(A.id, { city: 'Yopougon' }, null);
      expect(missing.status).toBe(422);
      expect(await missing.json()).toMatchObject({ code: 'validation_failed', fields: { 'If-Match': 'required' } });
      const res = await patch(A.id, {}, 1);
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe('validation_failed');
      expect(await row(A.id)).toMatchObject({ city: 'Abidjan', version: 1 });
    });

    it('audité : avant et après des seuls champs modifiés, téléphone masqué', async () => {
      const since = new Date();
      await patch(A.id, { city: 'Yopougon', contactPhone: '+2250708091011' }, 1);
      const { rows } = await f.h.superuser(
        `SELECT association_id, actor_user_id, before, after FROM audit_logs
          WHERE action = 'association.update' AND entity_id = $1 AND occurred_at >= $2`,
        [A.id, since],
      );
      expect(rows).toEqual([
        {
          association_id: A.id,
          actor_user_id: USERS.awa,
          before: { city: 'Abidjan', contactPhone: '+225 07 •• •• •• 00' },
          after: { city: 'Yopougon', contactPhone: '+225 07 •• •• •• 11' },
        },
      ]);
    });

    it('identifiant d’association en majuscules : même association, événement en minuscules', async () => {
      expect((await f.call(`/associations/${A.id.toUpperCase()}`, { token: awa })).status).toBe(200);
      expect((await patch(A.id.toUpperCase(), { city: 'Yopougon' }, 1)).status).toBe(200);
      expect(await events(A.id)).toEqual([expect.objectContaining({ association_id: A.id })]);
    });

    it('association suspendue : 403 association_suspended, rien n’est modifié', async () => {
      await f.h.superuser(`UPDATE associations SET status = 'suspended' WHERE id = $1`, [A.id]);
      try {
        const res = await patch(A.id, { city: 'Yopougon' }, 1);
        expect(res.status).toBe(403);
        expect(await codeOf(res)).toBe('association_suspended');
      } finally {
        await f.h.superuser(`UPDATE associations SET status = 'active' WHERE id = $1`, [A.id]);
      }
      expect(await row(A.id)).toMatchObject({ city: 'Abidjan', version: 1 });
    });

    it('viewer : 403 ; autre association : 404 ; rien n’est modifié', async () => {
      expect((await patch(A.id, { city: 'Yopougon' }, 1, koffi)).status).toBe(403);
      expect((await patch(B.id, { city: 'Yopougon' }, 1, awa)).status).toBe(404);
      expect(await row(A.id)).toMatchObject({ city: 'Abidjan', version: 1 });
      expect(await row(B.id)).toMatchObject({ city: 'Abidjan', version: 1 });
    });
  });

  describe('logo (as.upload, as.patch, as.file)', () => {
    it('logo déposé, analysé sain, rattaché puis lu par une URL signée', async () => {
      const fileId = await uploadLogo(A.id, awa);
      const { rows } = await f.h.superuser(
        'SELECT association_id, owner_user_id, bucket, object_key FROM files WHERE id = $1',
        [fileId],
      );
      expect(rows[0]).toMatchObject({ association_id: A.id, owner_user_id: USERS.awa, bucket: 'cotiz-media' });

      const res = await patch(A.id, { logoFileId: fileId }, 1);
      expect(res.status).toBe(200);
      expect(Association.parse(await res.json()).logoFileId).toBe(fileId);
      expect(await events(A.id)).toEqual([
        expect.objectContaining({ payload: { associationId: A.id, changedFields: ['logoFileId'] } }),
      ]);

      // Lecture par tout gestionnaire de A, viewer compris.
      const read = await fetch(`${f.base}/associations/${A.id}/files/${fileId}`, {
        headers: { authorization: `Bearer ${koffi}` },
        redirect: 'manual',
      });
      expect(read.status).toBe(302);
      const objectKey = (rows[0] as { object_key: string }).object_key;
      const location = new URL(read.headers.get('location') ?? '');
      expect(`${location.protocol}//${location.host}${location.pathname}`).toBe(
        `${minio.endpoint}/cotiz-media/${objectKey}`,
      );

      // Retrait du logo.
      expect((await patch(A.id, { logoFileId: null }, 2)).status).toBe(200);
      expect(await row(A.id)).toMatchObject({ logo_file_id: null, version: 3 });
    });

    it('logo non analysé, d’une autre association ou inconnu : 422, rien n’est modifié', async () => {
      const pending = await uploadLogo(A.id, awa, false);
      const ofB = await uploadLogo(B.id, koffi);
      // Fichier de A, sain, mais d'un autre usage (as.upload n'accepte que le logo : posé en base).
      const cover = '00000000-0000-7000-8000-0000000000fd';
      await f.h.superuser(
        `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
           size_bytes, sha256, scan_status)
         VALUES ($1, $2, $3, 'cover', 'cotiz-media', 'cover', 'cover.png', 'image/png', 16, repeat('b', 64), 'clean')
         ON CONFLICT (id) DO NOTHING`,
        [cover, A.id, USERS.awa],
      );
      for (const logoFileId of [pending, ofB, cover, '00000000-0000-7000-8000-0000000000fe']) {
        const res = await patch(A.id, { logoFileId }, 1);
        expect(res.status).toBe(422);
        expect(await res.json()).toMatchObject({ code: 'validation_failed', fields: { logoFileId: 'invalid' } });
      }
      expect(await row(A.id)).toMatchObject({ logo_file_id: null, version: 1 });
    });

    it('as.file : fichier d’une autre association → 404 ; non analysé → 404', async () => {
      const ofB = await uploadLogo(B.id, koffi);
      const pending = await uploadLogo(A.id, awa, false);
      for (const id of [ofB, pending]) {
        const res = await fetch(`${f.base}/associations/${A.id}/files/${id}`, {
          headers: { authorization: `Bearer ${awa}` },
          redirect: 'manual',
        });
        expect(res.status).toBe(404);
      }
    });

    it('as.upload : viewer 403, autre association 404, usage autre que le logo 422', async () => {
      const body = { purpose: 'logo', fileName: 'logo.png', mimeType: 'image/png', sizeBytes: PNG.length };
      expect((await f.call(`/associations/${A.id}/uploads`, { token: koffi, method: 'POST', body })).status).toBe(403);
      expect((await f.call(`/associations/${B.id}/uploads`, { token: awa, method: 'POST', body })).status).toBe(404);
      const cover = await f.call(`/associations/${A.id}/uploads`, {
        token: awa,
        method: 'POST',
        body: { ...body, purpose: 'cover' },
      });
      expect(cover.status).toBe(422);
      expect(await codeOf(cover)).toBe('validation_failed');
    });

    it('as.upload › complete : le déposant, gestionnaire des deux, ne confirme pas sous l’URL de l’autre', async () => {
      // Koffi, owner de B, devient owner de A le temps du test : seul l'{aid} de l'URL borne le dépôt.
      await f.h.superuser(`UPDATE memberships SET role = 'owner' WHERE association_id = $1 AND user_id = $2`, [
        A.id,
        USERS.koffi,
      ]);
      try {
        const res = await f.call(`/associations/${B.id}/uploads`, {
          token: koffi,
          method: 'POST',
          body: { purpose: 'logo', fileName: 'logo.png', mimeType: 'image/png', sizeBytes: PNG.length },
        });
        const ticket = UploadTicket.parse(await res.json());
        expect((await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: PNG })).status).toBe(200);
        const complete = (aid: string) =>
          f.call(`/associations/${aid}/uploads/${ticket.fileId}/complete`, { token: koffi, method: 'POST' });
        expect((await complete(A.id)).status).toBe(404);
        expect((await complete(B.id)).status).toBe(202);
      } finally {
        await f.h.superuser(`UPDATE memberships SET role = 'viewer' WHERE association_id = $1 AND user_id = $2`, [
          A.id,
          USERS.koffi,
        ]);
      }
    });

    it('as.file : le logo de A n’est pas lisible sous l’URL de B, même par un gestionnaire des deux', async () => {
      const ofA = await uploadLogo(A.id, awa);
      const read = (aid: string) =>
        fetch(`${f.base}/associations/${aid}/files/${ofA}`, {
          headers: { authorization: `Bearer ${koffi}` },
          redirect: 'manual',
        });
      expect((await read(B.id)).status).toBe(404);
      expect((await read(A.id)).status).toBe(302);
    });

    it('as.file : lecture auditée', async () => {
      const fileId = await uploadLogo(A.id, awa);
      const since = new Date();
      await fetch(`${f.base}/associations/${A.id}/files/${fileId}`, {
        headers: { authorization: `Bearer ${koffi}` },
        redirect: 'manual',
      });
      const { rows } = await f.h.superuser(
        `SELECT association_id, actor_user_id FROM audit_logs
          WHERE action = 'file.read' AND entity_id = $1 AND occurred_at >= $2`,
        [fileId, since],
      );
      expect(rows).toEqual([{ association_id: A.id, actor_user_id: USERS.koffi }]);
    });

    it('jeton souscripteur sur as.upload et as.file : 404', async () => {
      const fileId = await uploadLogo(A.id, awa);
      const body = { purpose: 'logo', fileName: 'logo.png', mimeType: 'image/png', sizeBytes: PNG.length };
      expect((await f.call(`/associations/${A.id}/uploads`, { token: moussa, method: 'POST', body })).status).toBe(404);
      expect((await f.call(`/associations/${A.id}/files/${fileId}`, { token: moussa })).status).toBe(404);
    });
  });
});
