import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type LedgerFixture, startLedgerFixture } from '../integration/ledger.fixture.js';
import { PROJECTS } from '../integration/members.fixture.js';
import { A, B, USERS } from './harness.js';

/**
 * Lot 4.7 · étape 3 : isolation de l'export de ses données (me.profile › export). Appartenances du jeu (comme
 * me-history) : A — Awa propriétaire, Moussa souscripteur, Fatou souscriptrice retirée ; B — Koffi propriétaire,
 * Fatou et Awa souscriptrices. Le fichier ne contient que les inscriptions et paiements de la personne du jeton, dans
 * les associations où elle est souscriptrice active ; hors espace souscripteur, aucun (`subscriber: null`). Politiques
 * élargies : le filtre du code tient seul.
 */

const Export = ENDPOINTS['me.profile'].operations.export.response.body;
const everyone = { using: 'true', withCheck: null };

describe('isolation : export de ses données (me.profile › export)', () => {
  let f: LedgerFixture;
  let fatou: string;

  /** Inscription active avec une échéance de `amount` au 2026-10-05, et un paiement validé de ce montant. */
  const paid = async (projectId: string, userId: string, associationId: string, amount: number) => {
    const enrollmentId = await f.enroll(projectId, userId, associationId);
    const installmentId = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                 amount_due, status)
       VALUES ($1, $2, $3, $4, $5, 'periodic', 1, '2026-10-05', $6, 'due')`,
      [installmentId, associationId, projectId, enrollmentId, userId, amount],
    );
    const paymentId = await f.record({
      enrollmentId,
      userId,
      associationId,
      projectId,
      amount,
      status: 'validated',
      declaredAt: '2026-10-05T09:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-10-05T09:00:00Z',
      lines: [{ installmentId, amount, state: 'confirmed' }],
    });
    return { enrollmentId, paymentId };
  };

  /** Moussa : une inscription dans A ; une dans B (non membre, retirée). Autrui : Fatou et Awa dans A et B. */
  const scenario = async () => {
    const moussaA = await paid(PROJECTS.a, USERS.moussa, A.id, 25000);
    const moussaB = await paid(PROJECTS.b, USERS.moussa, B.id, 70000);
    // Inscription retirée de Moussa dans A (appartenance active) : présente, retirées comprises.
    const moussaWithdrawn = await paid(PROJECTS.a2, USERS.moussa, A.id, 60000);
    const fatouA = await paid(PROJECTS.a, USERS.fatou, A.id, 40000);
    const fatouB = await paid(PROJECTS.b, USERS.fatou, B.id, 15000);
    const awaB = await paid(PROJECTS.b, USERS.awa, B.id, 20000);
    await f.h.superuser(
      `UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE id = ANY($1::uuid[])`,
      [[moussaB.enrollmentId, moussaWithdrawn.enrollmentId]],
    );
    return { moussaA, moussaB, moussaWithdrawn, fatouA, fatouB, awaB };
  };

  const exportOf = async (token: string) => {
    const res = await f.call('/me/export', { token });
    expect(res.status).toBe(200);
    return Export.parse(await res.json());
  };

  const eachSeesOnlyHis = async (p: Awaited<ReturnType<typeof scenario>>) => {
    const moussa = await exportOf(f.tokens.moussa);
    expect(moussa.profile.id).toBe(USERS.moussa);
    expect(moussa.subscriber?.enrollments.map((e) => [e.id, e.status, e.withdrawnAt !== null]).sort()).toEqual(
      [
        [p.moussaA.enrollmentId, 'active', false],
        [p.moussaWithdrawn.enrollmentId, 'withdrawn', true],
      ].sort(),
    );
    expect(moussa.subscriber?.payments.map((x) => [x.id, x.amountDeclared.amount]).sort()).toEqual(
      [
        [p.moussaA.paymentId, 25000],
        [p.moussaWithdrawn.paymentId, 60000],
      ].sort(),
    );
    // Fatou n'est plus souscriptrice de A : seulement B.
    const f2 = await exportOf(fatou);
    expect(f2.subscriber?.payments.map((x) => x.id)).toEqual([p.fatouB.paymentId]);
    expect(f2.subscriber?.enrollments.map((e) => e.association.id)).toEqual([B.id]);
    // Awa en espace association (gestionnaire de A) : ni inscriptions ni paiements, même ceux de B qui sont à elle.
    const awaManager = await exportOf(f.tokens.awa);
    expect(awaManager.profile.id).toBe(USERS.awa);
    expect(awaManager.subscriber).toBeNull();
    expect(JSON.stringify(awaManager)).not.toContain(p.awaB.paymentId);
    // Appartenances et connexions : celles de la personne seulement (`sessions` n'a pas de RLS : le filtre du code).
    expect(moussa.memberships.map((m) => [m.association.id, m.role])).toEqual([[A.id, 'subscriber']]);
    expect(awaManager.memberships.map((m) => [m.association.id, m.role]).sort()).toEqual(
      [
        [A.id, 'owner'],
        [B.id, 'subscriber'],
      ].sort(),
    );
    const sessionsOf = async (userId: string) =>
      (await f.h.superuser(`SELECT count(*)::int AS n FROM sessions WHERE user_id = $1`, [userId])).rows[0] as {
        n: number;
      };
    const all = (await f.h.superuser(`SELECT count(DISTINCT user_id)::int AS n FROM sessions`)).rows[0] as {
      n: number;
    };
    expect(all.n).toBeGreaterThanOrEqual(3);
    expect(moussa.sessions).toHaveLength((await sessionsOf(USERS.moussa)).n);
    // Compte : celui de la personne (dates propres à chacun, posées dans beforeAll).
    expect(moussa.account.createdAt).toBe('2020-01-02T00:00:00.000Z');
    expect(awaManager.account.createdAt).toBe('2020-01-03T00:00:00.000Z');
    expect(awaManager.sessions).toHaveLength((await sessionsOf(USERS.awa)).n);
  };

  beforeAll(async () => {
    f = await startLedgerFixture();
    fatou = await f.login('subscriber', 'fatou@test.cotiz.app');
    await f.h.superuser(
      `UPDATE users SET created_at = CASE id WHEN $1::uuid THEN '2020-01-02Z'::timestamptz ELSE '2020-01-03Z'::timestamptz END
        WHERE id = ANY($2::uuid[])`,
      [USERS.moussa, [USERS.moussa, USERS.awa]],
    );
  });
  afterAll(async () => {
    await f.stop();
  });
  beforeEach(async () => {
    await f.resetLedger();
  });

  it('chacun ses inscriptions et paiements ; hors espace souscripteur : aucun', async () => {
    await eachSeesOnlyHis(await scenario());
  });

  it('politiques élargies (paiements, inscriptions, échéances, répartitions, associations) : rien d’autrui', async () => {
    const p = await scenario();
    await f.h.withPolicy('payments', 'subscriber_self_read', everyone, () =>
      f.h.withPolicy('enrollments', 'subscriber_self_read', everyone, () =>
        f.h.withPolicy('installments', 'subscriber_self_read', everyone, () =>
          f.h.withPolicy('allocations', 'subscriber_self_read', everyone, () =>
            f.h.withPolicy('associations', 'member_read', everyone, () => eachSeesOnlyHis(p)),
          ),
        ),
      ),
    );
  });
});
