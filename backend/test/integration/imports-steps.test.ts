import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, USERS } from '../isolation/harness.js';
import { type ImportsFixture, Job, Row, startImportsFixture } from './imports.fixture.js';
import { PROJECTS } from './members.fixture.js';

/**
 * Lot 4.4 · étape 3 : classement des lignes (ready / existing / error / duplicate / ignored), correspondance des
 * colonnes (im.steps mapping, reclassement par le worker), correction d'une ligne (im.steps row), lecture (im.read).
 * Projet PROJECTS.a2 (actif) ; Fatou y est inscrite avant l'import.
 */

const FILE = [
  'Prénom;Nom;Téléphone;Quartier',
  'Aïcha;Bamba;0712345678;Yopougon', // 2 : nouveau compte
  'Moussa;Diallo;05 44 21 87 90;Cocody', // 3 : compte existant (Moussa)
  ';Coulibaly;0102030405;Abobo', // 4 : prénom manquant
  'Yao;Kouamé;07 12 34;Abobo', // 5 : téléphone incomplet
  'Aïcha;Bamba bis;+225 07 12 34 56 78;Yopougon', // 6 : doublon de la ligne 2
  'Fatou;Traoré;01 22 33 44 55;Plateau', // 7 : déjà inscrite au projet
].join('\n');

describe('imports : classement, correspondance, correction (im.steps, im.read)', () => {
  let f: ImportsFixture;
  let id: string;

  const patchRow = (rowId: string, body: unknown, importId = id) =>
    f.call(`/associations/${A.id}/imports/${importId}/rows/${rowId}`, { token: f.tokens.awa, method: 'PATCH', body });
  const patchMapping = (body: unknown, importId = id) =>
    f.call(`/associations/${A.id}/imports/${importId}/mapping`, { token: f.tokens.awa, method: 'PATCH', body });
  const rowAt = async (rowNumber: number) => {
    const row = (await f.rows(id, '?limit=100')).items.find((r) => r.rowNumber === rowNumber);
    if (!row) throw new Error(`ligne ${String(rowNumber)} absente`);
    return row;
  };
  const codeOf = async (res: Response) => ({ status: res.status, ...((await res.json()) as object) });

  beforeAll(async () => {
    f = await startImportsFixture();
  });

  afterAll(async () => {
    await f.stop();
  });

  beforeEach(async () => {
    await f.resetImports();
    await f.enroll(PROJECTS.a2, USERS.fatou);
    ({ id } = await f.analyzed(PROJECTS.a2, FILE));
  });

  it('classement : prête, compte existant, erreurs par champ, doublon, déjà inscrite', async () => {
    const job = await f.get(id);
    expect(job.status).toBe('validated');
    expect(job.counts).toEqual({ ready: 1, existing: 1, error: 3, duplicate: 1, ignored: 0 });
    const { items, total } = await f.rows(id);
    expect(total).toBe(6);
    expect(items.map((r) => [r.rowNumber, r.category, r.errors, r.duplicateOf, r.existingUserId])).toEqual([
      [2, 'ready', [], null, null],
      [3, 'existing', [], null, USERS.moussa],
      [4, 'error', [{ field: 'firstName', code: 'required' }], null, null],
      [5, 'error', [{ field: 'phone', code: 'invalid_phone' }], null, null],
      [6, 'duplicate', [], 2, null],
      [7, 'error', [{ field: null, code: 'already_enrolled' }], null, null],
    ]);
    expect(items[0]?.values).toEqual({
      firstName: 'Aïcha',
      lastName: 'Bamba',
      phone: '0712345678',
      address: 'Yopougon',
    });
  });

  it('lignes : filtre par catégorie, pages dans l’ordre du fichier, curseur invalide refusé', async () => {
    const errors = await f.rows(id, '?category=error');
    expect(errors.items.map((r) => r.rowNumber)).toEqual([4, 5, 7]);
    expect(errors.total).toBe(3);
    const first = await f.rows(id, '?limit=4');
    expect(first.items.map((r) => r.rowNumber)).toEqual([2, 3, 4, 5]);
    expect(first.nextCursor).not.toBeNull();
    const second = await f.rows(id, `?limit=4&cursor=${first.nextCursor ?? ''}`);
    expect(second.items.map((r) => r.rowNumber)).toEqual([6, 7]);
    expect(second.nextCursor).toBeNull();
    const bad = await f.call(`/associations/${A.id}/imports/${id}/rows?cursor=nimporte`, { token: f.tokens.awa });
    expect(bad.status).toBe(422);
  });

  describe('correspondance (im.steps mapping)', () => {
    it('modifiée : `mapped`, `import.mapped`, puis reclassée par le worker', async () => {
      const res = await patchMapping({ mapping: { Quartier: null } });
      expect(res.status).toBe(200);
      const job = Job.parse(await res.json());
      expect(job.status).toBe('mapped');
      expect(job.columns.find((c) => c.name === 'Quartier')?.field).toBeNull();
      expect((await f.events(id)).map((e) => e.type)).toEqual(['import.created', 'import.mapped']);

      await f.classify(id);
      expect((await f.get(id)).status).toBe('validated');
      expect((await rowAt(2)).values).toEqual({ firstName: 'Aïcha', lastName: 'Bamba', phone: '0712345678' });
      // Rejouée (déjà reclassée) : sans effet.
      await f.classify(id);
      expect((await f.get(id)).counts).toEqual({ ready: 1, existing: 1, error: 3, duplicate: 1, ignored: 0 });
    });

    it('champ obligatoire sans colonne, colonne inconnue, deux colonnes sur un champ : 422', async () => {
      expect(await codeOf(await patchMapping({ mapping: { Téléphone: null } }))).toMatchObject({
        status: 422,
        code: 'validation_failed',
        fields: { 'mapping.phone': 'required' },
      });
      expect(await codeOf(await patchMapping({ mapping: { Inconnue: 'email' } }))).toMatchObject({
        status: 422,
        fields: { mapping: 'unknown_column' },
      });
      expect(await codeOf(await patchMapping({ mapping: { Quartier: 'lastName' } }))).toMatchObject({
        status: 422,
        fields: { 'mapping.lastName': 'duplicate' },
      });
      expect((await f.get(id)).status).toBe('validated');
    });

    it('analyse en cours, envoi lancé, import terminé : 409 `invalid_state`', async () => {
      for (const status of ['uploaded', 'importing', 'completed', 'failed']) {
        await f.h.superuser('UPDATE import_jobs SET status = $2::import_jobs_status WHERE id = $1', [id, status]);
        expect(await codeOf(await patchMapping({ mapping: { Quartier: null } }))).toMatchObject({
          status: 409,
          code: 'invalid_state',
        });
      }
    });

    it('correspondance incomplète à l’analyse : complétée par le gestionnaire, puis classée', async () => {
      const { id: other } = await f.analyzed(PROJECTS.a2, 'Prénom;Famille;Tel\nAïcha;Bamba;0712345678');
      expect((await f.get(other)).status).toBe('mapped');
      await f.classify(other);
      expect((await f.get(other)).status).toBe('mapped');
      expect((await patchMapping({ mapping: { Famille: 'lastName' } }, other)).status).toBe(200);
      await f.classify(other);
      expect(await f.get(other)).toMatchObject({ status: 'validated', counts: { ready: 1 } });
    });
  });

  describe('correction d’une ligne (im.steps row)', () => {
    it('corrigée : recontrôlée, prête, compteurs à jour ; la correction prime sur le fichier', async () => {
      const row = await rowAt(4);
      const res = await patchRow(row.id, { values: { firstName: 'Mariam' } });
      expect(res.status).toBe(200);
      expect(Row.parse(await res.json())).toMatchObject({
        rowNumber: 4,
        category: 'ready',
        errors: [],
        values: { firstName: 'Mariam', lastName: 'Coulibaly' },
      });
      expect((await f.get(id)).counts).toEqual({ ready: 2, existing: 1, error: 2, duplicate: 1, ignored: 0 });
      // Reclassement complet (nouvelle correspondance) : la correction est gardée.
      await patchMapping({ mapping: { Quartier: null } });
      await f.classify(id);
      expect((await rowAt(4)).category).toBe('ready');
    });

    it('correction encore fausse : erreur ; numéro d’une ligne précédente : doublon', async () => {
      const row = await rowAt(5);
      const wrong = Row.parse(await (await patchRow(row.id, { values: { phone: '07 99' } })).json());
      expect(wrong).toMatchObject({ category: 'error', errors: [{ field: 'phone', code: 'invalid_phone' }] });
      const twin = Row.parse(await (await patchRow(row.id, { values: { phone: '0544218790' } })).json());
      expect(twin).toMatchObject({ category: 'duplicate', duplicateOf: 3 });
    });

    it('ignorée puis reprise ; une ligne ignorée le reste au reclassement', async () => {
      const row = await rowAt(5);
      expect(Row.parse(await (await patchRow(row.id, { ignore: true })).json()).category).toBe('ignored');
      expect((await f.get(id)).counts).toMatchObject({ error: 2, ignored: 1 });
      await patchMapping({ mapping: { Quartier: null } });
      await f.classify(id);
      expect((await rowAt(5)).category).toBe('ignored');
      expect(Row.parse(await (await patchRow(row.id, { ignore: false })).json()).category).toBe('error');
    });

    it('corps vide : 422 ; ligne d’un autre import : 404 ; import pas encore classé : 409', async () => {
      const row = await rowAt(4);
      expect((await patchRow(row.id, {})).status).toBe(422);
      const { id: other } = await f.analyzed(PROJECTS.a2, FILE);
      expect((await patchRow(row.id, { ignore: true }, other)).status).toBe(404);
      expect((await patchRow(crypto.randomUUID(), { ignore: true })).status).toBe(404);
      await f.h.superuser(`UPDATE import_jobs SET status = 'mapped' WHERE id = $1`, [id]);
      expect(await codeOf(await patchRow(row.id, { ignore: true }))).toMatchObject({
        status: 409,
        code: 'invalid_state',
      });
    });
  });
});
