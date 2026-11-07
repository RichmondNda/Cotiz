import { readFileSync } from 'node:fs';
import { ENDPOINTS, Problem } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';

/**
 * Lot 3.3 · étape 1 : me.alloc (proposeAllocation, aucune écriture), vecteurs normatifs `allocation.json` rejoués par
 * l'API. Pour chaque cas, les échéances de l'inscription de Moussa sur PROJECTS.a sont remplacées par celles du
 * vecteur (mêmes montants, statuts et montants en attente) ; identifiants du vecteur ↔ identifiants en base.
 */

interface VectorInstallment {
  id: string;
  kind: 'periodic' | 'entry_fee';
  sequence: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  amountPending: number;
  status: string;
}
interface VectorCase {
  name: string;
  input: { amount: number; installments: VectorInstallment[] };
  output?: { installmentId: string; amount: number }[];
  error?: { code: string; maxAmount?: number };
}

const VECTORS = JSON.parse(
  readFileSync(new URL('../../../docs/specs/test-vectors/allocation.json', import.meta.url), 'utf8'),
) as { cases: VectorCase[] };

const NOW = new Date('2026-11-08T10:00:00Z');
const Preview = ENDPOINTS['me.alloc'].operations.preview.response.body;
const XOF = (amount: number) => ({ amount, currency: 'XOF' });
const CLOSED = ['paid', 'waived', 'canceled'];

describe('me.alloc', () => {
  let f: LedgerFixture;
  let enrollmentId: string;

  const preview = (body: unknown, token = f.tokens.moussa) =>
    f.call('/me/payments/allocation-preview', { token, method: 'POST', body });
  const writes = async () =>
    (
      await f.h.superuser(
        `SELECT (SELECT count(*) FROM payments)::int AS payments, (SELECT count(*) FROM allocations)::int AS allocations,
                (SELECT coalesce(sum(amount_pending), 0)::int FROM installments) AS pending`,
      )
    ).rows[0] as { payments: number; allocations: number; pending: number };

  /** Échéances de l'inscription remplacées par celles du vecteur ; renvoie identifiant du vecteur → uuid. */
  const loadVector = async (installments: VectorInstallment[]) => {
    await f.h.superuser('DELETE FROM installments WHERE enrollment_id = $1', [enrollmentId]);
    const ids = new Map<string, string>();
    for (const i of installments) {
      const id = crypto.randomUUID();
      ids.set(i.id, id);
      await f.h.superuser(
        `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                   amount_due, amount_paid, amount_pending, status)
         VALUES ($1, $2, $3, $4, $5, $6::installments_kind, $7, $8, $9, $10, $11, $12::installments_status)`,
        [
          id,
          A.id,
          PROJECTS.a,
          enrollmentId,
          USERS.moussa,
          i.kind,
          i.sequence,
          i.dueDate,
          i.amountDue,
          i.amountPaid,
          i.amountPending,
          i.status,
        ],
      );
    }
    return ids;
  };

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
    enrollmentId = (await f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-03-01' })).id;
  });

  it('vecteurs : tous les cas sont rejoués', () => {
    expect(VECTORS.cases.length).toBeGreaterThanOrEqual(8);
  });

  for (const c of VECTORS.cases) {
    it(`vecteur ${c.name}`, async () => {
      const ids = await loadVector(c.input.installments);
      const before = await writes();
      const res = await preview({ projectId: PROJECTS.a, amount: XOF(c.input.amount) });
      if (c.output) {
        expect(res.status).toBe(200);
        const body = Preview.parse(await res.json());
        expect(body.allocations).toEqual(
          c.output.map((o) => ({ installmentId: ids.get(o.installmentId), amount: XOF(o.amount) })),
        );
        const open = c.input.installments
          .filter((i) => !CLOSED.includes(i.status))
          .reduce((s, i) => s + Math.max(0, i.amountDue - i.amountPaid - i.amountPending), 0);
        expect(body.remainingAfter).toEqual(XOF(open - c.input.amount));
      } else if (c.error?.code === 'amount_exceeds_remaining') {
        expect(res.status).toBe(422);
        const problem = Problem.parse(await res.json());
        expect(problem.code).toBe('amount_exceeds_remaining');
        expect(problem.maxAmount).toBe(c.error.maxAmount);
      } else {
        // invalid_amount : un montant ≤ 0 est refusé par le contrat (Money) avant le domaine.
        expect(c.error?.code).toBe('invalid_amount');
        expect(res.status).toBe(422);
        expect(Problem.parse(await res.json()).code).toBe('validation_failed');
      }
      expect(await writes()).toEqual(before);
    });
  }

  it('montant dans une autre devise → 422 validation_failed (amount: currency_mismatch)', async () => {
    const res = await preview({ projectId: PROJECTS.a, amount: { amount: 25000, currency: 'XAF' } });
    expect(res.status).toBe(422);
    const problem = Problem.parse(await res.json());
    expect(problem.code).toBe('validation_failed');
    expect(problem.fields).toEqual({ amount: 'currency_mismatch' });
  });

  it('projet sans inscription de la personne (autre association, inconnu) → 404 identique', async () => {
    for (const projectId of [PROJECTS.b, crypto.randomUUID()]) {
      const res = await preview({ projectId, amount: XOF(25000) });
      expect(res.status).toBe(404);
      expect(Problem.parse(await res.json()).code).toBe('not_found');
    }
  });

  it('inscription retirée → 404', async () => {
    await f.h.superuser(`UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1`, [
      enrollmentId,
    ]);
    const res = await preview({ projectId: PROJECTS.a, amount: XOF(25000) });
    expect(res.status).toBe(404);
  });
});
