import { ENDPOINTS, Problem } from '@cotiz/contracts';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LedgerFixture, startLedgerFixture } from '../integration/ledger.fixture.js';
import { PROJECTS } from '../integration/members.fixture.js';
import { METHODS } from '../integration/projects.fixture.js';
import { A, B, USERS } from './harness.js';

/**
 * Lot 3.2 · étape 3 : isolation de l'espace souscripteur (me.dash, me.projects, me.project), de bout en bout.
 * Appartenances du jeu : A — Awa propriétaire, Moussa souscripteur, Fatou souscriptrice retirée ; B — Koffi
 * propriétaire, Fatou et Awa souscriptrices. Chacun ne voit que ses inscriptions non retirées, dans les associations
 * où il est souscripteur actif ; tout autre projet → 404 identique (architecture/02).
 * Politiques élargies : la base laisse alors passer les lignes d'autrui, et le filtre du code tient seul.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Dashboard = ENDPOINTS['me.dash'].operations.get.response.body;
const Projects = ENDPOINTS['me.projects'].operations.list.response.body;
const Detail = ENDPOINTS['me.project'].operations.get.response.body;
const UNKNOWN = '00000000-0000-7000-8000-00000000dead';
const everyone = { using: 'true', withCheck: null };

describe('isolation : espace souscripteur (me.dash, me.projects, me.project)', () => {
  let f: LedgerFixture;
  let awaSubscriber: string;
  let fatou: string;

  const get = (path: string, token: string) => f.call(path, { token });
  const ok = async <T>(path: string, token: string, schema: { parse: (v: unknown) => T }) => {
    const res = await get(path, token);
    expect(res.status).toBe(200);
    return schema.parse(await res.json());
  };
  const dashboardOf = (token: string) => ok('/me/dashboard', token, Dashboard);
  const projectsOf = async (token: string) => (await ok('/me/projects', token, Projects)).items;
  const enrollmentsIn = (cards: readonly { enrollmentId: string }[]) => cards.map((c) => c.enrollmentId);
  /** 404 `not_found`, sans ce qui varie d'un appel à l'autre (instance, requestId). */
  const notFound = async (pid: string, token: string) => {
    const res = await get(`/me/projects/${pid}`, token);
    expect(res.status).toBe(404);
    const body = Problem.parse(await res.json());
    expect(body.code).toBe('not_found');
    return { status: body.status, code: body.code, title: body.title, type: body.type, detail: body.detail };
  };

  /** Inscription active avec une échéance de 25 000 F au 2026-03-05, réglée par un paiement validé. */
  const enrolledAndPaid = async (projectId: string, userId: string, associationId: string) => {
    const enrollmentId = await f.enroll(projectId, userId, associationId);
    const installmentId = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                 amount_due)
       VALUES ($1, $2, $3, $4, $5, 'periodic', 1, '2026-03-05', 25000)`,
      [installmentId, associationId, projectId, enrollmentId, userId],
    );
    const paymentId = await f.record({
      enrollmentId,
      userId,
      projectId,
      associationId,
      amount: 25000,
      status: 'validated',
      declaredAt: '2026-03-05T09:00:00Z',
      reviewedBy: associationId === A.id ? USERS.awa : USERS.koffi,
      reviewedAt: '2026-03-06T09:00:00Z',
      lines: [{ installmentId, amount: 25000, state: 'confirmed' }],
    });
    return { enrollmentId, paymentId };
  };

  /**
   * Moussa sur PROJECTS.a (A) ; Fatou sur PROJECTS.a (A, appartenance retirée) et PROJECTS.b (B) ; Awa sur PROJECTS.b
   * (B, souscriptrice) et PROJECTS.a (A, où elle n'est que gestionnaire).
   */
  const scenario = async () => ({
    moussaA: await enrolledAndPaid(PROJECTS.a, USERS.moussa, A.id),
    fatouA: await enrolledAndPaid(PROJECTS.a, USERS.fatou, A.id),
    fatouB: await enrolledAndPaid(PROJECTS.b, USERS.fatou, B.id),
    awaB: await enrolledAndPaid(PROJECTS.b, USERS.awa, B.id),
    awaA: await enrolledAndPaid(PROJECTS.a, USERS.awa, A.id),
  });

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startLedgerFixture();
    [awaSubscriber, fatou] = await Promise.all([
      f.login('subscriber', 'awa@test.cotiz.app'),
      f.login('subscriber', 'fatou@test.cotiz.app'),
    ]);
  });

  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await f.resetLedger();
    await f.redis.exec(['redis-cli', 'FLUSHALL']);
  });

  it('chacun ne voit que ses inscriptions et ses paiements', async () => {
    const s = await scenario();
    const moussa = await dashboardOf(f.tokens.moussa);
    expect(enrollmentsIn(moussa.projects)).toEqual([s.moussaA.enrollmentId]);
    expect(moussa.recentPayments.map((p) => p.id)).toEqual([s.moussaA.paymentId]);
    expect(moussa.associationsCount).toBe(1);
    expect(enrollmentsIn(await projectsOf(f.tokens.moussa))).toEqual([s.moussaA.enrollmentId]);
    // Projet partagé avec Fatou et Awa : la carte et les paiements de Moussa seulement.
    const detail = await ok(`/me/projects/${PROJECTS.a}`, f.tokens.moussa, Detail);
    expect(detail.enrollmentId).toBe(s.moussaA.enrollmentId);
    expect(detail.payments.map((p) => p.id)).toEqual([s.moussaA.paymentId]);
    expect(detail.installments).toHaveLength(1);

    // Fatou : son inscription de B seulement (appartenance de A retirée).
    const fatouDash = await dashboardOf(fatou);
    expect(enrollmentsIn(fatouDash.projects)).toEqual([s.fatouB.enrollmentId]);
    expect(fatouDash.recentPayments.map((p) => p.id)).toEqual([s.fatouB.paymentId]);
    expect(fatouDash.associationsCount).toBe(1);
    expect(enrollmentsIn(await projectsOf(fatou))).toEqual([s.fatouB.enrollmentId]);
    await notFound(PROJECTS.a, fatou);
  });

  it('gestionnaire de A, souscriptrice de B : rien de A dans son espace souscripteur', async () => {
    const s = await scenario();
    const awa = await dashboardOf(awaSubscriber);
    expect(enrollmentsIn(awa.projects)).toEqual([s.awaB.enrollmentId]);
    expect(awa.recentPayments.map((p) => p.id)).toEqual([s.awaB.paymentId]);
    expect(awa.associationsCount).toBe(1);
    expect(enrollmentsIn(await projectsOf(awaSubscriber))).toEqual([s.awaB.enrollmentId]);
    await notFound(PROJECTS.a, awaSubscriber);
    // Moyens de paiement : ceux de B seulement, alors que la base lui ouvre aussi ceux de A (appartenance active).
    const detail = await ok(`/me/projects/${PROJECTS.b}`, awaSubscriber, Detail);
    expect(detail.paymentMethods.map((m) => m.id)).toEqual([METHODS.bankB]);
  });

  it('projet d’un autre souscripteur, d’une autre association, retiré ou inconnu : 404 identique', async () => {
    const s = await scenario();
    await f.h.superuser(`UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1`, [
      s.moussaA.enrollmentId,
    ]);
    const unknown = await notFound(UNKNOWN, f.tokens.moussa);
    // Même association, projet existant sans inscription de Moussa.
    expect(await notFound(PROJECTS.a2, f.tokens.moussa)).toEqual(unknown);
    // Autre association : projet de Fatou et d'Awa.
    expect(await notFound(PROJECTS.b, f.tokens.moussa)).toEqual(unknown);
    // Son inscription retirée.
    expect(await notFound(PROJECTS.a, f.tokens.moussa)).toEqual(unknown);
    expect(await projectsOf(f.tokens.moussa)).toEqual([]);
    const dash = await dashboardOf(f.tokens.moussa);
    expect(dash.projects).toEqual([]);
    expect(dash.recentPayments).toEqual([]);
    // Identifiant malformé : refusé par le contrat, avant toute lecture.
    expect((await get('/me/projects/pas-un-uuid', f.tokens.moussa)).status).toBe(422);
  });

  it('cache du tableau de bord : une entrée par personne', async () => {
    const s = await scenario();
    expect(enrollmentsIn((await dashboardOf(f.tokens.moussa)).projects)).toEqual([s.moussaA.enrollmentId]);
    // Lu juste après la mise en cache de celui de Moussa : celui d'Awa est le sien, et inversement.
    expect(enrollmentsIn((await dashboardOf(awaSubscriber)).projects)).toEqual([s.awaB.enrollmentId]);
    expect(enrollmentsIn((await dashboardOf(f.tokens.moussa)).projects)).toEqual([s.moussaA.enrollmentId]);
  });

  it('jeton gestionnaire : 403 sur les trois routes', async () => {
    await scenario();
    for (const path of ['/me/dashboard', '/me/projects', `/me/projects/${PROJECTS.a}`]) {
      expect((await get(path, f.tokens.awa)).status).toBe(403);
    }
  });

  describe('politiques souscripteur élargies : le code filtre encore', () => {
    const widened = <T>(fn: () => Promise<T>) =>
      f.h.withPolicy('enrollments', 'subscriber_self_read', everyone, () =>
        f.h.withPolicy('installments', 'subscriber_self_read', everyone, () =>
          f.h.withPolicy('payments', 'subscriber_self_read', everyone, () =>
            f.h.withPolicy('allocations', 'subscriber_self_read', everyone, () =>
              f.h.withPolicy('association_payment_methods', 'member_read', everyone, fn),
            ),
          ),
        ),
      );
    const ownersSeenByMoussa = () =>
      f.h.as({ space: 'subscriber', userId: USERS.moussa }, (tx) =>
        tx
          .execute<{ user_id: string }>(sql`SELECT DISTINCT user_id FROM enrollments`)
          .then((r) => new Set(r.rows.map((row) => row.user_id))),
      );

    it('la base laisse alors passer les inscriptions d’autrui (le contrôle n’est pas vide)', async () => {
      await scenario();
      expect(await ownersSeenByMoussa()).toEqual(new Set([USERS.moussa]));
      expect(await widened(ownersSeenByMoussa)).toEqual(new Set([USERS.moussa, USERS.fatou, USERS.awa]));
    });

    it('me.dash, me.projects, me.project : rien d’autrui', async () => {
      const s = await scenario();
      await widened(async () => {
        const dash = await dashboardOf(f.tokens.moussa);
        expect(enrollmentsIn(dash.projects)).toEqual([s.moussaA.enrollmentId]);
        expect(dash.recentPayments.map((p) => p.id)).toEqual([s.moussaA.paymentId]);
        expect(enrollmentsIn(await projectsOf(f.tokens.moussa))).toEqual([s.moussaA.enrollmentId]);
        const detail = await ok(`/me/projects/${PROJECTS.a}`, f.tokens.moussa, Detail);
        expect(detail.payments.map((p) => p.id)).toEqual([s.moussaA.paymentId]);
        expect(detail.installments).toHaveLength(1);
        expect(detail.paymentMethods.map((m) => m.id)).toEqual([METHODS.orangeA]);
        await notFound(PROJECTS.b, f.tokens.moussa);
        expect(enrollmentsIn(await projectsOf(awaSubscriber))).toEqual([s.awaB.enrollmentId]);
      });
    });
  });
});
