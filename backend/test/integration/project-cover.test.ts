import { Project, StoredFile, UploadTicket } from '@cotiz/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { startMinio, type TestMinio } from '../support/minio.js';
import { codeOf } from './platform-associations.fixture.js';
import { FIXED, type ProjectsFixture, startProjectsFixture } from './projects.fixture.js';

/**
 * Lot 2.2 · étape 2 : image de couverture d'un projet déposée par pr.upload (purpose cover, permission projects.manage :
 * owner et manager), mêmes étapes que as.upload, lue par as.file ; rattachée par pr.create une fois analysée saine.
 */

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const COVER = { purpose: 'cover', fileName: 'couverture.png', mimeType: 'image/png', sizeBytes: PNG.length };

describe('couverture d’un projet (pr.upload)', () => {
  let f: ProjectsFixture;
  let minio: TestMinio;

  const request = (body: unknown, token = f.tokens.aminata, aid = A.id) =>
    f.call(`/associations/${aid}/projects/uploads`, { token, method: 'POST', body });

  beforeAll(async () => {
    minio = await startMinio();
    f = await startProjectsFixture({
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY_ID: minio.accessKeyId,
      S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
      // Pas de worker : la confirmation répond `pending`, le test pose le résultat de l'analyse.
      FILE_SCAN_WAIT_MS: '0',
    });
  });

  afterAll(async () => {
    await f.stop();
    await minio.stop();
  });

  it('une manager dépose, confirme, rattache la couverture et la relit par as.file', async () => {
    const res = await request(COVER);
    expect(res.status).toBe(201);
    const ticket = UploadTicket.parse(await res.json());
    expect((await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: PNG })).status).toBe(200);
    const done = await f.call(`/associations/${A.id}/projects/uploads/${ticket.fileId}/complete`, {
      token: f.tokens.aminata,
      method: 'POST',
    });
    expect(done.status).toBe(202);
    expect(StoredFile.parse(await done.json())).toMatchObject({ id: ticket.fileId, purpose: 'cover' });
    const { rows } = await f.h.superuser('SELECT association_id, owner_user_id FROM files WHERE id = $1', [
      ticket.fileId,
    ]);
    expect(rows).toEqual([{ association_id: A.id, owner_user_id: USERS.aminata }]);

    // Pas encore analysée : refusée ; saine : rattachée.
    expect((await f.create({ ...FIXED, coverFileId: ticket.fileId }, { token: f.tokens.aminata })).status).toBe(422);
    await f.h.superuser(`UPDATE files SET scan_status = 'clean', sha256 = repeat('a', 64) WHERE id = $1`, [
      ticket.fileId,
    ]);
    const project = Project.parse(
      await (await f.create({ ...FIXED, coverFileId: ticket.fileId }, { token: f.tokens.aminata })).json(),
    );
    expect(project).toMatchObject({ coverFileId: ticket.fileId, coverFileName: 'couverture.png' });
    const read = await fetch(`${f.base}/associations/${A.id}/files/${ticket.fileId}`, {
      headers: { authorization: `Bearer ${f.tokens.koffi}` },
      redirect: 'manual',
    });
    expect(read.status).toBe(302);
  });

  it('usage autre que la couverture : 422 ; type non permis : 422 file_type_not_allowed', async () => {
    const logo = await request({ ...COVER, purpose: 'logo' });
    expect(logo.status).toBe(422);
    expect(await codeOf(logo)).toBe('validation_failed');
    const pdf = await request({ ...COVER, fileName: 'c.pdf', mimeType: 'application/pdf' });
    expect(pdf.status).toBe(422);
    expect(await codeOf(pdf)).toBe('file_type_not_allowed');
  });

  it('viewer : 403 ; autre association ou souscripteur : 404 ; rien n’est enregistré', async () => {
    const before = (await f.h.superuser('SELECT 1 FROM files')).rowCount;
    expect((await request(COVER, f.tokens.koffi)).status).toBe(403);
    expect((await request(COVER, f.tokens.aminata, B.id)).status).toBe(404);
    expect((await request(COVER, f.tokens.moussa)).status).toBe(404);
    expect((await f.h.superuser('SELECT 1 FROM files')).rowCount).toBe(before);
  });

  it('confirmation : viewer 403 ; autre déposant, autre URL d’association, non-membre ou souscripteur : 404', async () => {
    const ticket = UploadTicket.parse(await (await request(COVER)).json());
    await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: PNG });
    const complete = (token: string, aid = A.id) =>
      f.call(`/associations/${aid}/projects/uploads/${ticket.fileId}/complete`, { token, method: 'POST' });
    expect((await complete(f.tokens.koffi)).status).toBe(403);
    // Awa : owner de A, n'a pas déposé ce fichier.
    expect((await complete(f.tokens.awa)).status).toBe(404);
    // Koffi : owner de B ; le fichier de A sous l'URL de B.
    expect((await complete(f.tokens.koffi, B.id)).status).toBe(404);
    // Aminata : déposante, mais pas gestionnaire de B.
    expect((await complete(f.tokens.aminata, B.id)).status).toBe(404);
    expect((await complete(f.tokens.moussa)).status).toBe(404);
    const events = await f.h.superuser(
      `SELECT 1 FROM outbox_events WHERE event_type = 'file.uploaded' AND aggregate_id = $1`,
      [ticket.fileId],
    );
    expect(events.rowCount).toBe(0);
    // La déposante, elle, confirme.
    expect((await complete(f.tokens.aminata)).status).toBe(202);
  });
});
