import { ENDPOINTS, Problem } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { METHODS } from './projects.fixture.js';

/**
 * Lot 3.3 · étape 3 : me.payment (suivi d'une déclaration, écrans mb-declarer-ok et mb-historique). Mêmes limites que
 * les lectures du lot 3.2 : inscription non retirée, appartenance souscripteur active ; sinon 404 identique.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Detail = ENDPOINTS['me.payment'].operations.get.response.body;
const Declared = ENDPOINTS['me.declare'].operations.declare.response.body;
const XOF = (amount: number) => ({ amount, currency: 'XOF' });
const UNKNOWN = '00000000-0000-7000-8000-00000000dead';

describe('me.payment', () => {
  let f: LedgerFixture;
  let enrollmentId: string;

  const get = (id: string, token = f.tokens.moussa) => f.call(`/me/payments/${id}`, { token });
  const detailOf = async (id: string) => {
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    return Detail.parse(await res.json());
  };
  const notFound = async (id: string, token?: string) => {
    const res = await get(id, token);
    expect(res.status).toBe(404);
    const p = Problem.parse(await res.json());
    return { status: p.status, code: p.code, title: p.title, detail: p.detail };
  };
  const line = async (dueDate: string, amount: number, state: 'proposed' | 'confirmed' | 'voided') => ({
    installmentId: await f.installmentOf(enrollmentId, dueDate),
    amount,
    state,
  });

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startLedgerFixture();
  });
  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });
  beforeEach(async () => {
    await f.resetLedger();
    await f.h.superuser(`UPDATE memberships SET status = 'active' WHERE user_id = $1 AND role = 'subscriber'`, [
      USERS.moussa,
    ]);
    enrollmentId = (await f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-03-01' })).id;
  });

  it('déclaration en attente : la même que me.declare, avec son moyen et son commentaire', async () => {
    const march = await f.installmentOf(enrollmentId, '2026-03-05');
    const res = await f.call('/me/payments', {
      token: f.tokens.moussa,
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: {
        projectId: PROJECTS.a,
        amount: XOF(25000),
        paidOn: '2026-11-07',
        paymentMethodId: METHODS.orangeA,
        transactionReference: 'OM-2611-4471',
        comment: 'Versé par mon frère',
        allocations: [{ installmentId: march, amount: XOF(25000) }],
      },
    });
    const declared = Declared.parse(await res.json());
    const detail = await detailOf(declared.id);
    const { paymentMethod, comment, ...rest } = detail;
    expect(rest).toEqual(declared);
    expect(comment).toBe('Versé par mon frère');
    expect(paymentMethod).toMatchObject({ id: METHODS.orangeA, kind: 'mobile_money', isActive: true });
    expect(detail.covered).toEqual([expect.objectContaining({ installmentId: march, amount: XOF(25000) })]);
    // Identifiant en majuscules : le même paiement.
    expect((await detailOf(declared.id.toUpperCase())).id).toBe(declared.id);
  });

  it('validée (montant reçu, revue) et rejetée (motif) ; sans moyen ni commentaire', async () => {
    const validated = await f.record({
      enrollmentId,
      userId: USERS.moussa,
      amount: 50000,
      status: 'validated',
      declaredAt: '2026-11-03T09:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-11-03T15:00:00Z',
      amountReceived: 50000,
      methodId: METHODS.orangeA,
      lines: [await line('2026-03-05', 25000, 'confirmed'), await line('2026-04-05', 25000, 'confirmed')],
    });
    const v = await detailOf(validated);
    expect(v).toMatchObject({
      status: 'validated',
      amountReceived: XOF(50000),
      reviewedAt: '2026-11-03T15:00:00.000Z',
      rejection: null,
      comment: null,
      paymentMethod: { id: METHODS.orangeA },
    });
    expect(v.covered).toHaveLength(2);

    const rejected = await f.record({
      enrollmentId,
      userId: USERS.moussa,
      amount: 25000,
      status: 'rejected',
      declaredAt: '2026-11-04T09:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-11-04T15:00:00Z',
      rejection: { code: 'unreadable_proof', message: 'Photo floue' },
      lines: [await line('2026-05-05', 25000, 'voided')],
    });
    expect(await detailOf(rejected)).toMatchObject({
      status: 'rejected',
      rejection: { reasonCode: 'unreadable_proof', message: 'Photo floue' },
      paymentMethod: null,
      amountReceived: null,
    });
  });

  it('inconnu, appartenance retirée → même 404 ; inscription retirée → lisible, marquée ; jeton gestionnaire → 403', async () => {
    const payment = await f.record({
      enrollmentId,
      userId: USERS.moussa,
      amount: 25000,
      status: 'pending',
      declaredAt: '2026-11-07T09:00:00Z',
      lines: [await line('2026-03-05', 25000, 'proposed')],
    });
    const unknown = await notFound(UNKNOWN);
    expect((await get(payment, f.tokens.awa)).status).toBe(403);

    await f.h.superuser(`UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1`, [
      enrollmentId,
    ]);
    // Inscription retirée : paiement gardé en lecture seule (décision du 2026-11-10).
    const withdrawn = await get(payment);
    expect(withdrawn.status).toBe(200);
    expect(((await withdrawn.json()) as { enrollmentWithdrawn: boolean }).enrollmentWithdrawn).toBe(true);
    await f.h.superuser(`UPDATE enrollments SET status = 'active', withdrawn_at = NULL WHERE id = $1`, [enrollmentId]);
    const active = await get(payment);
    expect(active.status).toBe(200);
    expect(((await active.json()) as { enrollmentWithdrawn: boolean }).enrollmentWithdrawn).toBe(false);

    await f.h.superuser(
      `UPDATE memberships SET status = 'removed' WHERE user_id = $1 AND association_id = $2 AND role = 'subscriber'`,
      [USERS.moussa, A.id],
    );
    expect(await notFound(payment)).toEqual(unknown);
  });
});
