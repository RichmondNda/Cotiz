import { ENDPOINTS, Problem } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LedgerFixture, startLedgerFixture } from '../integration/ledger.fixture.js';
import { PROJECTS } from '../integration/members.fixture.js';
import { A, B, USERS } from './harness.js';

/**
 * Lot 3.3 : isolation des paiements du souscripteur (me.alloc, me.declare, me.payment).
 * Appartenances du jeu : A — Awa propriétaire, Moussa souscripteur, Fatou souscriptrice retirée ; B — Koffi
 * propriétaire, Fatou et Awa souscriptrices. Chacun n'est servi que sur ses inscriptions non retirées, dans les
 * associations où il est souscripteur actif ; tout autre projet → 404 identique. Politiques élargies : le filtre du
 * code tient seul.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Preview = ENDPOINTS['me.alloc'].operations.preview.response.body;
const UNKNOWN = '00000000-0000-7000-8000-00000000dead';
const everyone = { using: 'true', withCheck: null };
const XOF = (amount: number) => ({ amount, currency: 'XOF' });

describe('isolation : paiements du souscripteur (me.alloc, me.declare, me.payment)', () => {
  let f: LedgerFixture;
  let awaSubscriber: string;
  let fatou: string;

  const preview = (projectId: string, amount: number, token: string) =>
    f.call('/me/payments/allocation-preview', { token, method: 'POST', body: { projectId, amount: XOF(amount) } });
  const notFound = async (projectId: string, token: string) => {
    const res = await preview(projectId, 25000, token);
    expect(res.status).toBe(404);
    const body = Problem.parse(await res.json());
    expect(body.code).toBe('not_found');
    return { status: body.status, code: body.code, title: body.title, type: body.type, detail: body.detail };
  };

  /** Inscription active avec une échéance ouverte de 25 000 F au 2026-10-05 ; renvoie l'échéance. */
  const enrolledOpen = async (projectId: string, userId: string, associationId: string) => {
    const enrollmentId = await f.enroll(projectId, userId, associationId);
    const installmentId = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                 amount_due, status)
       VALUES ($1, $2, $3, $4, $5, 'periodic', 1, '2026-10-05', 25000, 'late')`,
      [installmentId, associationId, projectId, enrollmentId, userId],
    );
    return installmentId;
  };
  /** Moussa, Fatou (appartenance retirée) et Awa (gestionnaire seulement) sur PROJECTS.a ; Fatou et Awa sur PROJECTS.b. */
  const scenario = async () => ({
    moussaA: await enrolledOpen(PROJECTS.a, USERS.moussa, A.id),
    fatouA: await enrolledOpen(PROJECTS.a, USERS.fatou, A.id),
    awaA: await enrolledOpen(PROJECTS.a, USERS.awa, A.id),
    fatouB: await enrolledOpen(PROJECTS.b, USERS.fatou, B.id),
    awaB: await enrolledOpen(PROJECTS.b, USERS.awa, B.id),
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
  });

  it('me.alloc : seulement les échéances de la personne, sur le projet demandé', async () => {
    const s = await scenario();
    const res = await preview(PROJECTS.a, 25000, f.tokens.moussa);
    expect(res.status).toBe(200);
    expect(Preview.parse(await res.json()).allocations).toEqual([{ installmentId: s.moussaA, amount: XOF(25000) }]);
    // Le reste dû est le sien seul (25 000 F), pas celui du projet.
    const over = await preview(PROJECTS.a, 50000, f.tokens.moussa);
    expect(over.status).toBe(422);
    expect(Problem.parse(await over.json())).toMatchObject({ code: 'amount_exceeds_remaining', maxAmount: 25000 });
    const awa = await preview(PROJECTS.b, 25000, awaSubscriber);
    expect(Preview.parse(await awa.json()).allocations).toEqual([{ installmentId: s.awaB, amount: XOF(25000) }]);
  });

  it('me.alloc : autre association, appartenance retirée, gestionnaire seulement, inconnu → 404 identique', async () => {
    await scenario();
    const unknown = await notFound(UNKNOWN, f.tokens.moussa);
    expect(await notFound(PROJECTS.b, f.tokens.moussa)).toEqual(unknown);
    expect(await notFound(PROJECTS.a2, f.tokens.moussa)).toEqual(unknown);
    // Fatou : inscrite sur PROJECTS.a, mais plus souscriptrice de A.
    expect(await notFound(PROJECTS.a, fatou)).toEqual(unknown);
    // Awa : inscrite sur PROJECTS.a, mais seulement gestionnaire de A.
    expect(await notFound(PROJECTS.a, awaSubscriber)).toEqual(unknown);
  });

  it('me.alloc : jeton gestionnaire → 403', async () => {
    await scenario();
    expect((await preview(PROJECTS.a, 25000, f.tokens.awa)).status).toBe(403);
  });

  it('me.alloc, politiques élargies : rien d’autrui', async () => {
    const s = await scenario();
    // Inscription de Moussa la plus récente : sans le filtre sur la personne, celle de Fatou ou d'Awa (même projet,
    // même association) viendrait en premier.
    await f.h.superuser(`UPDATE enrollments SET joined_at = now() + interval '1 day' WHERE user_id = $1`, [
      USERS.moussa,
    ]);
    await f.h.withPolicy('enrollments', 'subscriber_self_read', everyone, () =>
      f.h.withPolicy('installments', 'subscriber_self_read', everyone, async () => {
        const res = await preview(PROJECTS.a, 25000, f.tokens.moussa);
        expect(Preview.parse(await res.json()).allocations).toEqual([{ installmentId: s.moussaA, amount: XOF(25000) }]);
        const over = await preview(PROJECTS.a, 50000, f.tokens.moussa);
        expect(Problem.parse(await over.json())).toMatchObject({ maxAmount: 25000 });
        await notFound(PROJECTS.a, fatou);
      }),
    );
  });

  // ---------------------------------------------------------------- me.declare

  const declare = (projectId: string, token: string, over: Record<string, unknown> = {}, key?: string) =>
    f.call('/me/payments', {
      token,
      method: 'POST',
      headers: { 'idempotency-key': key ?? crypto.randomUUID() },
      body: {
        projectId,
        amount: XOF(25000),
        paidOn: '2026-11-07',
        paymentMethodId: null,
        transactionReference: 'REF-1',
        allocations: [],
        ...over,
      },
    });
  const counts = async () =>
    (
      await f.h.superuser(
        `SELECT (SELECT count(*) FROM payments)::int AS payments,
                (SELECT coalesce(sum(amount_pending), 0)::int FROM installments WHERE user_id <> $1) AS othersPending`,
        [USERS.moussa],
      )
    ).rows[0] as { payments: number; otherspending: number };
  /** Preuve propre déposée par `owner` (sans association). */
  const proofOf = async (owner: string) => {
    const id = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO files (id, owner_user_id, purpose, bucket, object_key, original_name, mime_type, size_bytes, sha256,
                          scan_status)
       VALUES ($1, $2, 'payment_proof', 'cotiz-proofs', $3, 'recu.jpg', 'image/jpeg', 1024, 'abc', 'clean')`,
      [id, owner, `unassigned/payment_proof/${id}.jpg`],
    );
    return id;
  };

  it('me.declare : autre association, appartenance retirée, gestionnaire seulement → 404 ; rien n’est écrit', async () => {
    const s = await scenario();
    const own = (installmentId: string) => ({ allocations: [{ installmentId, amount: XOF(25000) }] });
    const notFound = async (pid: string, token: string, mine: string) => {
      const res = await declare(pid, token, own(mine));
      expect(res.status).toBe(404);
      const body = Problem.parse(await res.json());
      return { status: body.status, code: body.code, title: body.title, type: body.type, detail: body.detail };
    };
    const unknown = await notFound(UNKNOWN, f.tokens.moussa, s.moussaA);
    expect(unknown.code).toBe('not_found');
    for (const [pid, token, mine] of [
      [PROJECTS.b, f.tokens.moussa, s.fatouB],
      [PROJECTS.a, fatou, s.fatouA],
      [PROJECTS.a, awaSubscriber, s.awaA],
    ] as const) {
      expect(await notFound(pid, token, mine)).toEqual(unknown);
    }
    expect((await declare(PROJECTS.a, f.tokens.awa, own(s.moussaA))).status).toBe(403);
    expect(await counts()).toEqual({ payments: 0, otherspending: 0 });
  });

  it('me.declare : échéance et preuve d’autrui refusées, même politiques élargies ; la sienne passe', async () => {
    const s = await scenario();
    const fatouProof = await proofOf(USERS.fatou);
    const attempts = async (widened: boolean) => {
      // Échéance de Fatou sur le même projet, seule ou mêlée à celle de Moussa. Politiques élargies : visible, mais
      // refusée par validateAllocation (hors de l'inscription : mixed_enrollments) ; sinon inconnue.
      const theirs = await declare(PROJECTS.a, f.tokens.moussa, {
        allocations: [{ installmentId: s.fatouA, amount: XOF(25000) }],
      });
      expect(theirs.status).toBe(422);
      expect(Problem.parse(await theirs.json())).toMatchObject({
        code: 'validation_failed',
        fields: widened
          ? { allocations: 'mixed_enrollments' }
          : { [`allocations.${s.fatouA}`]: 'installment_not_open' },
      });
      const mixed = await declare(PROJECTS.a, f.tokens.moussa, {
        amount: XOF(50000),
        allocations: [
          { installmentId: s.moussaA, amount: XOF(25000) },
          { installmentId: s.fatouA, amount: XOF(25000) },
        ],
      });
      expect(mixed.status).toBe(422);
      // Reste dû de Moussa seul (25 000 F) : l'échéance de Fatou n'y entre pas.
      expect(Problem.parse(await mixed.json())).toMatchObject({ code: 'amount_exceeds_remaining', maxAmount: 25000 });
      // Preuve déposée par Fatou.
      const proof = await declare(PROJECTS.a, f.tokens.moussa, {
        transactionReference: undefined,
        proofFileId: fatouProof,
        allocations: [{ installmentId: s.moussaA, amount: XOF(25000) }],
      });
      expect(proof.status).toBe(422);
      expect(Problem.parse(await proof.json())).toMatchObject({
        code: 'validation_failed',
        fields: { proofFileId: 'not_found' },
      });
      expect(await counts()).toEqual({ payments: 0, otherspending: 0 });
    };
    await attempts(false);
    await f.h.withPolicy('enrollments', 'subscriber_self_read', everyone, () =>
      f.h.withPolicy('installments', 'subscriber_self_read', everyone, () =>
        f.h.withPolicy('installments', 'subscriber_pending_update', { using: 'true', withCheck: 'true' }, () =>
          f.h.withPolicy('files', 'owner_access', { using: 'true', withCheck: 'true' }, () =>
            f.h.withPolicy('payments', 'subscriber_self_read', everyone, async () => {
              await attempts(true);
              // Paiement de Fatou visible ici, avec la clé que Moussa va envoyer : pas un rejeu pour Moussa (filtre
              // user_id du rejeu), ni idempotency_key_reused.
              const key = crypto.randomUUID();
              const fatouPayment = await f.record({
                enrollmentId: (
                  (await f.h.superuser('SELECT enrollment_id FROM installments WHERE id = $1', [s.fatouA])).rows[0] as {
                    enrollment_id: string;
                  }
                ).enrollment_id,
                userId: USERS.fatou,
                associationId: A.id,
                projectId: PROJECTS.a,
                amount: 25000,
                status: 'pending',
                declaredAt: '2026-11-07T09:00:00Z',
                lines: [{ installmentId: s.fatouA, amount: 25000, state: 'proposed' }],
              });
              // Clé posée après coup (f.record en tire une au hasard) ; payments_guard l'interdit : déclencheurs coupés.
              await f.h.superuser(
                `SET session_replication_role = replica;
                 UPDATE payments SET idempotency_key = '${key}' WHERE id = '${fatouPayment}'`,
              );
              // La sienne, avec la clé de Fatou : acceptée, nouveau paiement.
              const ok = await declare(
                PROJECTS.a,
                f.tokens.moussa,
                { allocations: [{ installmentId: s.moussaA, amount: XOF(25000) }] },
                key,
              );
              expect(ok.status).toBe(201);
            }),
          ),
        ),
      ),
    );
    expect(await counts()).toEqual({ payments: 2, otherspending: 25000 });
  });

  // ---------------------------------------------------------------- me.payment

  /** Paiement en attente de `userId` sur l'échéance `installmentId` (inscription relue en base). */
  const pendingOf = async (installmentId: string, associationId: string = A.id, projectId: string = PROJECTS.a) => {
    const [row] = (
      await f.h.superuser('SELECT enrollment_id, user_id FROM installments WHERE id = $1', [installmentId])
    ).rows as { enrollment_id: string; user_id: string }[];
    if (!row) throw new Error('échéance absente');
    return f.record({
      enrollmentId: row.enrollment_id,
      userId: row.user_id,
      associationId,
      projectId,
      amount: 25000,
      status: 'pending',
      declaredAt: '2026-11-07T09:00:00Z',
      lines: [{ installmentId, amount: 25000, state: 'proposed' }],
    });
  };
  const getPayment = (id: string, token: string) => f.call(`/me/payments/${id}`, { token });
  const paymentNotFound = async (id: string, token: string) => {
    const res = await getPayment(id, token);
    expect(res.status).toBe(404);
    const body = Problem.parse(await res.json());
    return { status: body.status, code: body.code, title: body.title, type: body.type, detail: body.detail };
  };

  it('me.payment : paiement d’autrui, d’une autre association, appartenance retirée → même 404 que l’inconnu', async () => {
    const s = await scenario();
    const p = {
      moussaA: await pendingOf(s.moussaA),
      fatouA: await pendingOf(s.fatouA),
      awaA: await pendingOf(s.awaA),
      fatouB: await pendingOf(s.fatouB, B.id, PROJECTS.b),
      awaB: await pendingOf(s.awaB, B.id, PROJECTS.b),
    };
    const unknown = await paymentNotFound(UNKNOWN, f.tokens.moussa);
    for (const id of [p.fatouA, p.awaA, p.fatouB, p.awaB]) {
      expect(await paymentNotFound(id, f.tokens.moussa)).toEqual(unknown);
    }
    // Fatou plus souscriptrice de A ; Awa seulement gestionnaire de A : leurs paiements de A ne sont plus servis.
    expect(await paymentNotFound(p.fatouA, fatou)).toEqual(unknown);
    expect(await paymentNotFound(p.awaA, awaSubscriber)).toEqual(unknown);
    expect(await paymentNotFound(p.moussaA, fatou)).toEqual(unknown);
    expect((await getPayment(p.awaB, awaSubscriber)).status).toBe(200);
    expect((await getPayment(p.moussaA, f.tokens.moussa)).status).toBe(200);
    expect((await getPayment(p.moussaA, f.tokens.awa)).status).toBe(403);
  });

  it('me.payment, politiques élargies : le paiement d’autrui reste introuvable', async () => {
    const s = await scenario();
    const theirs = await pendingOf(s.fatouA);
    const mine = await pendingOf(s.moussaA);
    await f.h.withPolicy('payments', 'subscriber_self_read', everyone, () =>
      f.h.withPolicy('enrollments', 'subscriber_self_read', everyone, () =>
        f.h.withPolicy('allocations', 'subscriber_self_read', everyone, async () => {
          expect((await getPayment(theirs, f.tokens.moussa)).status).toBe(404);
          const res = await getPayment(mine, f.tokens.moussa);
          expect(res.status).toBe(200);
          const body = (await res.json()) as { id: string; covered: { installmentId: string }[] };
          expect(body.id).toBe(mine);
          expect(body.covered.map((c) => c.installmentId)).toEqual([s.moussaA]);
        }),
      ),
    );
  });
});
