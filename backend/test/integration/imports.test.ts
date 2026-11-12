import { StoredFile, UploadTicket } from '@cotiz/contracts';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ImportJobsConsumer } from '../../src/modules/imports/events/import-jobs.consumer.js';
import { A, B, USERS } from '../isolation/harness.js';
import { CSV, type ImportsFixture, Job, startImportsFixture, XLSX } from './imports.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { PLANS } from './platform-associations.fixture.js';

/**
 * Lot 4.4 : imports en masse de souscripteurs. Étape 2 : im.flow et analyse dans le worker (fichier lu, colonnes
 * détectées, correspondance proposée, lignes enregistrées), 5 000 lignes sans bloquer l'API.
 */

const MOCKUP = [
  'Prénom;NOM;Tel;Mail;Quartier',
  'Aïcha;Bamba;0712345678;aicha@exemple.ci;Yopougon',
  'Yao;Kouamé;0501020304;;Abobo',
  'Mariam;Coulibaly;0102030405;mariam@exemple.ci;Cocody',
].join('\n');

/** Numéro mobile ivoirien national valide, distinct pour chaque `n` (< 10 000 000). */
const localPhone = (n: number) => `070${String(n).padStart(7, '0')}`;

async function xlsx(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Membres');
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('imports : création et analyse (im.flow, worker)', () => {
  let f: ImportsFixture;
  const statusOf = async (res: Response) => ({
    status: res.status,
    code: ((await res.json()) as { code?: string }).code,
  });

  beforeAll(async () => {
    f = await startImportsFixture();
  });

  afterAll(async () => {
    await f.stop();
  });

  beforeEach(async () => {
    await f.resetImports();
  });

  it('im.flow : 201 `uploaded`, `import.created` ; analyse : colonnes, exemples, correspondance, lignes', async () => {
    const fileId = await f.upload(MOCKUP);
    const res = await f.flow(PROJECTS.a, fileId);
    expect(res.status).toBe(201);
    const created = Job.parse(await res.json());
    expect(created).toMatchObject({ projectId: PROJECTS.a, sourceFileId: fileId, status: 'uploaded', columns: [] });
    expect(await f.events(created.id)).toEqual([{ type: 'import.created', payload: { importId: created.id } }]);

    expect(await f.analyze(created.id)).toBe('done');
    const job = await f.get(created.id);
    expect(job.status).toBe('validated');
    expect(job.columns).toEqual([
      { name: 'Prénom', samples: ['Aïcha', 'Yao', 'Mariam'], field: 'firstName' },
      { name: 'NOM', samples: ['Bamba', 'Kouamé', 'Coulibaly'], field: 'lastName' },
      { name: 'Tel', samples: ['0712345678', '0501020304', '0102030405'], field: 'phone' },
      { name: 'Mail', samples: ['aicha@exemple.ci', 'mariam@exemple.ci'], field: 'email' },
      { name: 'Quartier', samples: ['Yopougon', 'Abobo', 'Cocody'], field: 'address' },
    ]);
    expect(job.counts).toEqual({ ready: 3, existing: 0, error: 0, duplicate: 0, ignored: 0 });
    const raw = await f.h.superuser('SELECT row_number, raw FROM import_rows ORDER BY row_number');
    expect(raw.rows[0]).toEqual({
      row_number: 2,
      raw: { Prénom: 'Aïcha', NOM: 'Bamba', Tel: '0712345678', Mail: 'aicha@exemple.ci', Quartier: 'Yopougon' },
    });
    // Rejouée : sans effet (aucune ligne en double).
    expect(await f.analyze(created.id)).toBe('done');
    expect((await f.h.superuser('SELECT count(*)::int AS n FROM import_rows')).rows).toEqual([{ n: 3 }]);
  });

  it('correspondance incomplète : `mapped`, lignes enregistrées mais pas classées', async () => {
    const job = await f.analyzed(PROJECTS.a, 'Prénom;Famille;Tel\nAïcha;Bamba;0712345678');
    expect(job.status).toBe('mapped');
    expect(job.columns.map((c) => c.field)).toEqual(['firstName', null, 'phone']);
  });

  it('XLSX : première feuille, numéro saisi comme nombre (zéro perdu) relu', async () => {
    const content = await xlsx([
      ['Prénom', 'Nom', 'Téléphone'],
      ['Aïcha', 'Bamba', 712345678],
    ]);
    const job = await f.analyzed(PROJECTS.a, content, XLSX);
    expect(job).toMatchObject({ status: 'validated', counts: { ready: 1, error: 0 } });
    expect(job.columns[2]).toEqual({ name: 'Téléphone', samples: ['712345678'], field: 'phone' });
  });

  it('fichier pas encore analysé par l’antivirus : le worker attend, puis analyse ; au-delà de 30 min : refusé', async () => {
    const pending = await f.upload(MOCKUP, { scanStatus: 'pending' });
    const { id } = Job.parse(await (await f.flow(PROJECTS.a, pending)).json());
    expect(await f.analyze(id)).toBe('wait');
    expect((await f.get(id)).status).toBe('uploaded');
    await f.h.superuser(`UPDATE files SET scan_status = 'clean', sha256 = repeat('0', 64) WHERE id = $1`, [pending]);
    expect(await f.analyze(id)).toBe('done');
    expect((await f.get(id)).status).toBe('validated');

    const stale = await f.upload(MOCKUP, { scanStatus: 'pending', createdAt: '2026-01-01T00:00:00Z' });
    const other = Job.parse(await (await f.flow(PROJECTS.a, stale)).json());
    expect(await f.analyze(other.id)).toBe('done');
    expect(await f.get(other.id)).toMatchObject({ status: 'failed', failure: 'file_rejected' });
    expect((await f.events(other.id)).at(-1)).toEqual({
      type: 'import.failed',
      payload: { importId: other.id, error: 'file_rejected' },
    });
  });

  it.each([
    ['illisible', Buffer.from('pas un classeur'), XLSX, 'unreadable'],
    ['vide', 'Prénom;Nom;Tel\n;;\n', CSV, 'empty'],
    [
      'trop long',
      ['Prénom;Nom;Tel', ...Array.from({ length: 5001 }, (_, i) => `A;B;${localPhone(i)}`)].join('\n'),
      CSV,
      'too_many_rows',
    ],
  ])('fichier %s : `failed`, `import.failed`, aucune ligne', async (_name, content, mime, failure) => {
    const { id } = Job.parse(await (await f.flow(PROJECTS.a, await f.upload(content, { mime }))).json());
    expect(await f.analyze(id)).toBe('done');
    expect(await f.get(id)).toMatchObject({ status: 'failed', failure, columns: [] });
    expect((await f.events(id)).map((e) => e.type)).toEqual(['import.created', 'import.failed']);
    expect((await f.h.superuser('SELECT count(*)::int AS n FROM import_rows')).rows).toEqual([{ n: 0 }]);
  });

  /** Attend que l'import atteigne ce statut (worker réel, file `imports`), 15 s au plus. */
  const until = async (id: string, status: string) => {
    for (let i = 0; i < 150; i++) {
      if ((await f.get(id)).status === status) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`import ${id} jamais ${status}`);
  };
  const envelope = (id: string, n: number) => ({
    id: String(n),
    type: 'import.created' as const,
    version: 1,
    occurredAt: new Date().toISOString(),
    associationId: A.id,
    actorUserId: USERS.awa,
    aggregate: { type: 'import', id },
    payload: { importId: id },
  });

  it('chaîne réelle : `import.created` → file `imports` → analyse ; association occupée : job différé', async () => {
    const { id } = Job.parse(await (await f.flow(PROJECTS.a, await f.upload(MOCKUP))).json());
    // Une autre tâche d'import de A tient le verrou : le job attend, sans échouer.
    await f.redis.exec(['redis-cli', 'SET', `cotiz:lock:imports:${A.id}`, 'autre', 'PX', '60000']);
    await f.worker.get(ImportJobsConsumer).handle(envelope(id, Date.now()));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect((await f.get(id)).status).toBe('uploaded');
    await f.redis.exec(['redis-cli', 'DEL', `cotiz:lock:imports:${A.id}`]);
    await until(id, 'validated');
  });

  it('im.upload : dépôt par l’URL de l’association, confirmé, puis im.flow et analyse du fichier déposé', async () => {
    const body = {
      purpose: 'import_source',
      fileName: 'membres.csv',
      mimeType: CSV,
      sizeBytes: Buffer.byteLength(MOCKUP),
    };
    const res = await f.call(`/associations/${A.id}/imports/uploads`, { token: f.tokens.awa, method: 'POST', body });
    expect(res.status).toBe(201);
    const ticket = UploadTicket.parse(await res.json());
    const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: MOCKUP });
    expect(put.status).toBe(200);
    const done = await f.call(`/associations/${A.id}/imports/uploads/${ticket.fileId}/complete`, {
      token: f.tokens.awa,
      method: 'POST',
    });
    expect(done.status).toBe(202);
    expect(StoredFile.parse(await done.json())).toMatchObject({ id: ticket.fileId, purpose: 'import_source' });
    expect(
      (await f.h.superuser('SELECT association_id, owner_user_id FROM files WHERE id = $1', [ticket.fileId])).rows,
    ).toEqual([{ association_id: A.id, owner_user_id: USERS.awa }]);
    await f.h.superuser(`UPDATE files SET scan_status = 'clean', sha256 = repeat('0', 64) WHERE id = $1`, [
      ticket.fileId,
    ]);

    const { id } = Job.parse(await (await f.flow(PROJECTS.a, ticket.fileId)).json());
    expect(await f.analyze(id)).toBe('done');
    expect(await f.get(id)).toMatchObject({ status: 'validated', counts: { ready: 3 } });
  });

  it('im.upload : autre usage 422 ; lecteur 403 ; fl.upload refuse toujours l’espace association', async () => {
    const body = { purpose: 'import_source', fileName: 'membres.csv', mimeType: CSV, sizeBytes: 10 };
    const upload = (b: unknown, token = f.tokens.awa) =>
      f.call(`/associations/${A.id}/imports/uploads`, { token, method: 'POST', body: b });
    expect((await upload({ ...body, purpose: 'logo' })).status).toBe(422);
    expect((await upload(body, f.tokens.koffi)).status).toBe(403);
    expect((await f.call('/uploads', { token: f.tokens.awa, method: 'POST', body })).status).toBe(403);
  });

  describe('refus de im.flow', () => {
    it('fonctionnalité absente du plan : 403 `feature_disabled`', async () => {
      await f.h.superuser('UPDATE plans SET features = $2 WHERE id = $1', [PLANS.essentiel, []]);
      expect(await statusOf(await f.flow(PROJECTS.a, await f.upload(MOCKUP)))).toEqual({
        status: 403,
        code: 'feature_disabled',
      });
    });

    it('fichier d’un autre usage ou refusé par l’antivirus : 422 `file_type_not_allowed`', async () => {
      const statement = await f.upload(MOCKUP, { purpose: 'bank_statement' });
      expect(await statusOf(await f.flow(PROJECTS.a, statement))).toEqual({
        status: 422,
        code: 'file_type_not_allowed',
      });
      const infected = await f.upload(MOCKUP, { scanStatus: 'infected' });
      expect(await statusOf(await f.flow(PROJECTS.a, infected))).toEqual({
        status: 422,
        code: 'file_type_not_allowed',
      });
    });

    it('plus aucune place de souscripteur : 409 `quota_exceeded`', async () => {
      await f.h.superuser('UPDATE plans SET max_subscribers = 1 WHERE id = $1', [PLANS.essentiel]);
      expect(await statusOf(await f.flow(PROJECTS.a, await f.upload(MOCKUP)))).toEqual({
        status: 409,
        code: 'quota_exceeded',
      });
    });

    it('fichier ou projet d’une autre association, inconnu : 404 ; lecteur : 403', async () => {
      const ofB = await f.upload(MOCKUP, { aid: B.id });
      expect((await f.flow(PROJECTS.a, ofB)).status).toBe(404);
      expect((await f.flow(PROJECTS.b, await f.upload(MOCKUP))).status).toBe(404);
      expect((await f.flow(PROJECTS.a, crypto.randomUUID())).status).toBe(404);
      expect((await f.flow(PROJECTS.a, await f.upload(MOCKUP), { token: f.tokens.koffi })).status).toBe(403);
    });
  });

  it('vérification de l’étape : 5 000 lignes analysées par le worker sans bloquer l’API', async () => {
    await f.h.superuser('UPDATE plans SET max_subscribers = NULL WHERE id = $1', [PLANS.essentiel]);
    const lines = Array.from({ length: 5000 }, (_, i) => `Prénom${String(i)};Nom${String(i)};${localPhone(i)}`);
    const fileId = await f.upload(['Prénom;Nom;Téléphone', ...lines].join('\n'));

    const started = Date.now();
    const res = await f.flow(PROJECTS.a, fileId);
    expect(res.status).toBe(201);
    expect(Date.now() - started).toBeLessThan(1000);
    const { id } = Job.parse(await res.json());

    // Pendant l'analyse (même processus ici ; en production le worker est un autre processus), l'API répond.
    const state = { analyzing: true };
    const latencies: number[] = [];
    const probe = (async () => {
      while (state.analyzing) {
        const t = Date.now();
        await f.get(id);
        latencies.push(Date.now() - t);
      }
    })();
    const t0 = Date.now();
    expect(await f.analyze(id)).toBe('done');
    const analysis = Date.now() - t0;
    state.analyzing = false;
    await probe;

    expect(await f.get(id)).toMatchObject({ status: 'validated', counts: { ready: 5000, error: 0, duplicate: 0 } });
    expect(analysis).toBeLessThan(30_000);
    expect(latencies.length).toBeGreaterThan(1);
    expect(Math.max(...latencies)).toBeLessThan(2000);
  });
});
