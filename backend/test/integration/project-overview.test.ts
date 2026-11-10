import { ProjectOverview } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B } from '../isolation/harness.js';
import { codeOf } from './platform-associations.fixture.js';
import { FIXED, ROLLING, type ProjectsFixture, startProjectsFixture, xof } from './projects.fixture.js';

/**
 * Lot 2.2 · étape 5 : vue d'ensemble d'un projet (pr.overview). Avant les inscriptions (lot 2.3) et les paiements
 * (lot 2.4) : rien d'attendu, d'encaissé ni de retard, aucun souscripteur ; une entrée par échéance du calendrier
 * (dates fixes, projet en cours ou terminé), à 0, dans la devise du projet. Vérification de l'étape : réponse conforme.
 */

describe('vue d’ensemble d’un projet (pr.overview)', () => {
  let f: ProjectsFixture;

  const overview = (pid: string, token = f.tokens.awa, aid = A.id) =>
    f.call(`/associations/${aid}/projects/${pid}/overview`, { token });
  const read = async (pid: string, token = f.tokens.awa) => {
    const res = await overview(pid, token);
    expect(res.status).toBe(200);
    return ProjectOverview.parse(await res.json());
  };
  const setStatus = (pid: string, status: string) =>
    f.h.superuser('UPDATE projects SET status = $2 WHERE id = $1', [pid, status]);

  beforeAll(async () => {
    f = await startProjectsFixture();
  });

  afterAll(() => f.stop());

  beforeEach(() => f.reset());

  it('brouillon : tout à zéro, aucun souscripteur, remplissage attendu du projet', async () => {
    const project = await f.created(FIXED);
    expect(await read(project.id)).toEqual({
      collected: xof(0),
      expectedToDate: xof(0),
      recoveryRate: null,
      late: { count: 0, amount: xof(0) },
      nextDue: null,
      enrollment: { count: 0, required: 60 },
      paymentsToReview: { count: 0, oldestDeclaredAt: null },
      unsignedContracts: [],
      collectionBySequence: [],
      lateMembers: [],
    });
  });

  it('dates fixes en cours : une entrée par échéance (hors fonds d’entrée), attendu et reçu à 0', async () => {
    const project = await f.created(FIXED);
    await setStatus(project.id, 'active');
    const { collectionBySequence } = await read(project.id);
    // Mars 2026 → août 2027, le 5 : 18 échéances.
    expect(collectionBySequence).toHaveLength(18);
    expect(collectionBySequence[0]).toEqual({ sequence: 1, dueDate: '2026-03-05', expected: xof(0), received: xof(0) });
    expect(collectionBySequence[17]).toEqual({
      sequence: 18,
      dueDate: '2027-08-05',
      expected: xof(0),
      received: xof(0),
    });
    expect(collectionBySequence.map((c) => c.sequence)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  it.each([
    ['inscriptions ouvertes', FIXED, 'enrolling'],
    ['cycle roulant en cours', ROLLING, 'active'],
    ['cycle roulant terminé', ROLLING, 'completed'],
  ] as const)('%s : pas de collecte par échéance', async (_why, body, status) => {
    const project = await f.created(body);
    await setStatus(project.id, status);
    expect((await read(project.id)).collectionBySequence).toEqual([]);
  });

  it('terminé : collecte par échéance ; limite de souscripteurs absente : null', async () => {
    const project = await f.created({ ...FIXED, requiredSubscribers: null });
    await setStatus(project.id, 'completed');
    const result = await read(project.id);
    expect(result.collectionBySequence).toHaveLength(18);
    expect(result.enrollment).toEqual({ count: 0, required: null });
  });

  it('archivé : collecte par échéance conservée', async () => {
    const project = await f.created(FIXED);
    await setStatus(project.id, 'archived');
    expect((await read(project.id)).collectionBySequence).toHaveLength(18);
  });

  it('viewer et manager : lecture permise', async () => {
    const project = await f.created(ROLLING);
    expect((await overview(project.id, f.tokens.koffi)).status).toBe(200);
    expect((await overview(project.id, f.tokens.aminata)).status).toBe(200);
  });

  it('projet d’une autre association (sous l’URL de A ou de B), souscripteur, inconnu : 404', async () => {
    const ofB = await f.created(ROLLING, { aid: B.id, token: f.tokens.koffi });
    expect((await overview(ofB.id)).status).toBe(404);
    expect((await overview(ofB.id, f.tokens.aminata, B.id)).status).toBe(404);
    const ofA = await f.created(ROLLING);
    expect((await overview(ofA.id, f.tokens.koffi, B.id)).status).toBe(404);
    expect((await overview(ofA.id, f.tokens.moussa)).status).toBe(404);
    const unknown = await overview('00000000-0000-7000-8000-00000000c2ff');
    expect(unknown.status).toBe(404);
    expect(await codeOf(unknown)).toBe('not_found');
  });
});
