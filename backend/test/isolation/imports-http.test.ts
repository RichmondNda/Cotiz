import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ImportsFixture, startImportsFixture } from '../integration/imports.fixture.js';
import { PROJECTS } from '../integration/members.fixture.js';
import { A, asManagerOf, B } from './harness.js';

/**
 * Isolation HTTP des imports (lot 4.4) : l'import d'une association est introuvable (404, comme un identifiant
 * inconnu) par le gestionnaire d'une autre, sur toutes les routes, sans rien modifier ; lecteur et souscripteur
 * refusés. Politiques élargies : la base laisse passer, le code filtre encore (import cherché par association).
 */

describe('isolation HTTP : imports', () => {
  let f: ImportsFixture;
  let id: string;
  let rowId: string;

  /** Chaque route de im.* sur l'import `importId`, par `token` dans l'espace de `aid` : les statuts. */
  const statuses = async (aid: string, token: string, importId = id, row = rowId) => {
    const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
      f
        .call(`/associations/${aid}/imports/${importId}${path}`, {
          token,
          ...init,
          headers: { 'idempotency-key': crypto.randomUUID() },
        })
        .then((r) => r.status);
    return {
      get: await call(''),
      rows: await call('/rows'),
      mapping: await call('/mapping', { method: 'PATCH', body: { mapping: { Tel: 'phone' } } }),
      row: await call(`/rows/${row}`, { method: 'PATCH', body: { ignore: true } }),
      commit: await call('/commit', { method: 'POST' }),
    };
  };
  const notFound = { get: 404, rows: 404, mapping: 404, row: 404, commit: 404 };
  const untouched = async () => {
    expect(await f.get(id)).toMatchObject({ status: 'validated', counts: { ready: 1, ignored: 0 } });
    expect(await f.events(id)).toHaveLength(1);
  };

  beforeAll(async () => {
    f = await startImportsFixture();
  });

  afterAll(async () => {
    await f.stop();
  });

  beforeEach(async () => {
    await f.resetImports();
    ({ id } = await f.analyzed(PROJECTS.a, 'Prénom;Nom;Tel\nAïcha;Bamba;0712345678'));
    rowId = (await f.rows(id)).items[0]?.id ?? '';
  });

  it('owner de B sur l’import de A, par l’espace de B : 404 partout, comme un import inconnu, rien de modifié', async () => {
    expect(await statuses(B.id, f.tokens.koffi)).toEqual(notFound);
    expect(await statuses(B.id, f.tokens.koffi, crypto.randomUUID())).toEqual(notFound);
    await untouched();
  });

  it('im.upload : lecteur 403, souscripteur 404 ; fichier de A confirmé par l’URL de B (son owner) → 404', async () => {
    const body = { purpose: 'import_source', fileName: 'membres.csv', mimeType: 'text/csv', sizeBytes: 10 };
    const create = (aid: string, token: string) =>
      f.call(`/associations/${aid}/imports/uploads`, { token, method: 'POST', body });
    expect((await create(A.id, f.tokens.koffi)).status).toBe(403); // Koffi est lecteur de A
    expect((await create(A.id, f.tokens.moussa)).status).toBe(404);
    const res = await create(A.id, f.tokens.awa);
    expect(res.status).toBe(201);
    const { fileId } = (await res.json()) as { fileId: string };
    const complete = await f.call(`/associations/${B.id}/imports/uploads/${fileId}/complete`, {
      token: f.tokens.koffi,
      method: 'POST',
    });
    expect(complete.status).toBe(404);
    expect((await f.h.superuser('SELECT association_id FROM files WHERE id = $1', [fileId])).rows).toEqual([
      { association_id: A.id },
    ]);
  });

  it('lecteur de A : 403 ; souscripteur sans rôle de gestion : 404 (association cachée)', async () => {
    expect(await statuses(A.id, f.tokens.koffi)).toEqual({ get: 403, rows: 403, mapping: 403, row: 403, commit: 403 });
    const subscriber = await statuses(A.id, f.tokens.moussa);
    expect(subscriber).toEqual(notFound);
    await untouched();
  });

  it('politiques élargies : la base montre l’import de A à B, l’API répond toujours 404', async () => {
    const open = { using: 'true', withCheck: 'true' };
    await f.h.withPolicy('import_jobs', 'tenant_isolation', open, async () => {
      await f.h.withPolicy('import_rows', 'tenant_isolation', open, async () => {
        const visible = await f.h.as(asManagerOf(B), (tx) =>
          tx.execute<{ id: string }>(sql`SELECT id FROM import_jobs`).then((r) => r.rows.map((row) => row.id)),
        );
        expect(visible).toContain(id);
        expect(await statuses(B.id, f.tokens.koffi)).toEqual(notFound);
      });
    });
    await untouched();
  });
});
