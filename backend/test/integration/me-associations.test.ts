import { ENDPOINTS, Problem } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { METHODS } from './projects.fixture.js';

/**
 * Lot 4.5 · étape 2 : me.assos (mes associations, fiche d'une association), réponses conformes au contrat.
 * Jeu : Fatou souscriptrice de B (rejointe le 2024-06-01) et, rétablie ici, de A (2025-01-10). Horloge 2026-11-08.
 * Une échéance de 25 000 F au 2026-03-05 par inscription : réglée dans B, impayée (donc en retard) dans A.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const List = ENDPOINTS['me.assos'].operations.list.response.body;
const Detail = ENDPOINTS['me.assos'].operations.get.response.body;
const UNKNOWN = '00000000-0000-7000-8000-00000000dead';
const XOF = (amount: number) => ({ amount, currency: 'XOF' });

describe('me.assos', () => {
  let f: LedgerFixture;
  let fatou: string;
  let awaSubscriber: string;

  const get = (path: string, token = fatou) => f.call(path, { token });
  const listOf = async (token = fatou) => {
    const res = await get('/me/associations', token);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    return List.parse(await res.json()).items;
  };
  const detailOf = async (aid: string) => {
    const res = await get(`/me/associations/${aid}`);
    expect(res.status).toBe(200);
    return Detail.parse(await res.json());
  };
  const notFound = async (aid: string, token = fatou) => {
    const res = await get(`/me/associations/${aid}`, token);
    expect(res.status).toBe(404);
    const body = Problem.parse(await res.json());
    expect(body.code).toBe('not_found');
    return { status: body.status, code: body.code, title: body.title, detail: body.detail };
  };
  const setMembership = (aid: string, status: 'active' | 'removed', joinedAt: string | null) =>
    f.h.superuser(
      `UPDATE memberships SET status = $3::memberships_status, joined_at = $4,
              removed_at = CASE WHEN $3 = 'removed' THEN now() END
        WHERE association_id = $1 AND user_id = $2 AND role = 'subscriber'`,
      [aid, USERS.fatou, status, joinedAt],
    );
  /** Inscription active de Fatou avec une échéance de 25 000 F au 2026-03-05, réglée si `paid`. */
  const enrolled = async (projectId: string, associationId: string, paid: boolean) => {
    const enrollmentId = await f.enroll(projectId, USERS.fatou, associationId);
    const installmentId = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                 amount_due)
       VALUES ($1, $2, $3, $4, $5, 'periodic', 1, '2026-03-05', 25000)`,
      [installmentId, associationId, projectId, enrollmentId, USERS.fatou],
    );
    if (paid) {
      await f.record({
        enrollmentId,
        userId: USERS.fatou,
        projectId,
        associationId,
        amount: 25000,
        status: 'validated',
        declaredAt: '2026-03-05T09:00:00Z',
        reviewedBy: associationId === A.id ? USERS.awa : USERS.koffi,
        reviewedAt: '2026-03-06T09:00:00Z',
        lines: [{ installmentId, amount: 25000, state: 'confirmed' }],
      });
    }
    return enrollmentId;
  };
  const withdraw = (enrollmentId: string) =>
    f.h.superuser(`UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1`, [enrollmentId]);
  /** Fatou dans B (réglée) et A (en retard), plus une inscription retirée sur PROJECTS.a2. */
  const scenario = async () => {
    await setMembership(B.id, 'active', '2024-06-01T08:00:00Z');
    await setMembership(A.id, 'active', '2025-01-10T08:00:00Z');
    const inB = await enrolled(PROJECTS.b, B.id, true);
    const inA = await enrolled(PROJECTS.a, A.id, false);
    const withdrawnA = await enrolled(PROJECTS.a2, A.id, false);
    await withdraw(withdrawnA);
    return { inA, inB, withdrawnA };
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startLedgerFixture();
    [fatou, awaSubscriber] = await Promise.all([
      f.login('subscriber', 'fatou@test.cotiz.app'),
      f.login('subscriber', 'awa@test.cotiz.app'),
    ]);
  });

  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await f.resetLedger();
    await f.h.superuser(`UPDATE projects SET status = 'active' WHERE id = ANY($1::uuid[])`, [[PROJECTS.a, PROJECTS.b]]);
    await f.h.superuser(`UPDATE associations SET status = 'active', suspended_at = NULL WHERE id = $1`, [B.id]);
    await f.redis.exec(['redis-cli', 'FLUSHALL']);
  });

  it('liste : ses deux associations, dans l’ordre d’arrivée, avec leurs chiffres', async () => {
    await scenario();
    expect(await listOf()).toEqual([
      {
        association: { id: B.id, name: 'Ressortissants de Man', logoFileId: null, suspended: false, city: 'Abidjan' },
        memberSince: '2024-06-01T08:00:00.000Z',
        activeProjects: 1,
        remaining: XOF(0),
        standing: 'up_to_date',
      },
      {
        association: { id: A.id, name: 'Entraide Yopougon', logoFileId: null, suspended: false, city: 'Abidjan' },
        memberSince: '2025-01-10T08:00:00.000Z',
        // L'inscription retirée de PROJECTS.a2 ne compte ni dans les projets en cours ni dans le reste dû.
        activeProjects: 1,
        remaining: XOF(25000),
        standing: 'late',
      },
    ]);
  });

  it('liste : sans projet en cours ni reste à régler, l’association n’y est plus (sa fiche reste lisible)', async () => {
    const s = await scenario();
    // B : projet terminé et soldé → absente ; A : projet terminé avec un reste → présente, aucun projet en cours.
    await f.h.superuser(`UPDATE projects SET status = 'completed' WHERE id = ANY($1::uuid[])`, [
      [PROJECTS.a, PROJECTS.b],
    ]);
    const items = await listOf();
    expect(items.map((i) => i.association.id)).toEqual([A.id]);
    expect(items[0]).toMatchObject({ activeProjects: 0, remaining: XOF(25000) });
    // Tout retiré dans A : plus rien à régler.
    await withdraw(s.inA);
    expect(await listOf()).toEqual([]);
    expect((await detailOf(A.id)).projects).toEqual([]);
    expect((await detailOf(B.id)).association.id).toBe(B.id);
  });

  it('liste : projet archivé hors des projets en cours, toujours compté dans le reste dû', async () => {
    await scenario();
    await f.h.superuser(`UPDATE projects SET status = 'archived' WHERE id = $1`, [PROJECTS.a]);
    const [, inA] = await listOf();
    expect(inA).toMatchObject({
      association: { id: A.id },
      activeProjects: 0,
      remaining: XOF(25000),
      standing: 'late',
    });
  });

  it('liste : arrivée inconnue → date de création de l’appartenance ; association suspendue marquée', async () => {
    await scenario();
    await setMembership(B.id, 'active', null);
    const [created] = (
      await f.h.superuser(
        `SELECT created_at FROM memberships WHERE association_id = $1 AND user_id = $2 AND role = 'subscriber'`,
        [B.id, USERS.fatou],
      )
    ).rows as { created_at: Date }[];
    await f.h.superuser(`UPDATE associations SET status = 'suspended', suspended_at = now() WHERE id = $1`, [B.id]);
    const items = await listOf();
    const inB = items.find((i) => i.association.id === B.id);
    expect(inB?.memberSince).toBe(created?.created_at.toISOString());
    expect(inB?.association.suspended).toBe(true);
    expect(items.find((i) => i.association.id === A.id)?.association.suspended).toBe(false);
    expect((await detailOf(B.id)).association.suspended).toBe(true);
  });

  it('liste : membre sans aucune inscription → liste vide, fiche lisible', async () => {
    await setMembership(A.id, 'active', '2025-01-10T08:00:00Z');
    await setMembership(B.id, 'active', '2024-06-01T08:00:00Z');
    expect(await listOf()).toEqual([]);
    expect((await detailOf(A.id)).projects).toEqual([]);
  });

  it('fiche : coordonnées, projets non retirés, moyens de paiement actifs de l’association', async () => {
    const s = await scenario();
    const d = await detailOf(A.id);
    expect(d.association).toEqual({
      id: A.id,
      name: 'Entraide Yopougon',
      logoFileId: null,
      suspended: false,
      city: 'Abidjan',
      country: 'CI',
      description: null,
      contactEmail: 'contact@ey.ci',
      contactPhone: '+2250700000000',
    });
    expect(d.projects.map((p) => p.enrollmentId)).toEqual([s.inA]);
    expect(d.projects[0]).toMatchObject({ project: { id: PROJECTS.a }, standing: 'late', remaining: XOF(25000) });
    // Le moyen inactif de A n'est pas présenté ; ceux de B jamais.
    expect(d.paymentMethods.map((m) => m.id)).toEqual([METHODS.orangeA]);
    expect((await detailOf(B.id)).paymentMethods.map((m) => m.id)).toEqual([METHODS.bankB]);
  });

  it('association non rejointe, gérée seulement, retirée ou inconnue : 404 identique', async () => {
    await scenario();
    const unknown = await notFound(UNKNOWN);
    // Moussa n'est souscripteur que de A (ici la RLS masque déjà B ; le filtre du code : test d'isolation élargi).
    expect(await notFound(B.id, f.tokens.moussa)).toEqual(unknown);
    // Awa gère A et n'y est pas souscriptrice : sa fiche souscripteur de A n'existe pas.
    await f.enroll(PROJECTS.b, USERS.awa, B.id);
    expect(await notFound(A.id, awaSubscriber)).toEqual(unknown);
    expect((await listOf(awaSubscriber)).map((i) => i.association.id)).toEqual([B.id]);
    // Fatou retirée de A : A disparaît de la liste et de la fiche.
    await setMembership(A.id, 'removed', '2025-01-10T08:00:00Z');
    expect(await notFound(A.id)).toEqual(unknown);
    expect((await listOf()).map((i) => i.association.id)).toEqual([B.id]);
    expect((await get('/me/associations/pas-un-uuid')).status).toBe(422);
  });

  it('jeton gestionnaire : 403 sur les deux routes', async () => {
    for (const path of ['/me/associations', `/me/associations/${A.id}`]) {
      expect((await get(path, f.tokens.awa)).status).toBe(403);
    }
  });
});
