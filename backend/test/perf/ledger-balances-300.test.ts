import {
  type Allocation,
  excludingPayment,
  type LedgerInstallment,
  proposeAllocation,
  validateAllocation,
} from '@cotiz/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { A, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from '../integration/ledger.fixture.js';
import { xof } from '../integration/projects.fixture.js';

/**
 * Lot 2.4 · étape 6, vérification (décision C9) : 300 opérations en base, tirées d'une graine fixe — déclarations
 * (posées comme le lot 3.3 les écrira) et validations par lg.pay.validate (répartition du souscripteur, ajustée avec
 * un montant reçu, ou invalide) — puis, régulièrement : soldes stockés des échéances = soldes recalculés depuis les
 * répartitions, statut `paid` / `declared` cohérent avec eux. Longue : lancée seule, après la suite parallèle.
 */

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('soldes des échéances sous 300 opérations (lg.pay.validate)', () => {
  let f: LedgerFixture;

  const ledgerOf = async (enrollmentId: string): Promise<LedgerInstallment[]> =>
    (
      (
        await f.h.superuser(
          `SELECT id, enrollment_id, kind, sequence, due_date::text, amount_due::int, amount_paid::int,
                  amount_pending::int, status FROM installments WHERE enrollment_id = $1`,
          [enrollmentId],
        )
      ).rows as {
        id: string;
        enrollment_id: string;
        kind: 'entry_fee' | 'periodic';
        sequence: number;
        due_date: string;
        amount_due: number;
        amount_paid: number;
        amount_pending: number;
        status: LedgerInstallment['status'];
      }[]
    ).map((r) => ({
      id: r.id,
      enrollmentId: r.enrollment_id,
      kind: r.kind,
      sequence: r.sequence,
      dueDate: r.due_date,
      lateFrom: null,
      amountDue: r.amount_due,
      amountPaid: r.amount_paid,
      amountPending: r.amount_pending,
      status: r.status,
    }));

  /** Échéances dont le solde stocké ou le statut ne correspond pas aux répartitions vivantes. */
  const drift = async () =>
    (
      await f.h.superuser(
        `SELECT i.id, i.amount_paid::int, i.amount_pending::int, i.status, x.paid::int, x.pending::int
           FROM installments i
           CROSS JOIN LATERAL (
             SELECT coalesce(sum(a.amount) FILTER (WHERE a.state = 'confirmed' AND p.status = 'validated'), 0) AS paid,
                    coalesce(sum(a.amount) FILTER (WHERE a.state = 'proposed' AND p.status = 'pending'), 0) AS pending
               FROM allocations a JOIN payments p ON p.id = a.payment_id
              WHERE a.installment_id = i.id) x
          WHERE i.amount_paid <> x.paid OR i.amount_pending <> x.pending
             OR (i.amount_paid >= i.amount_due) <> (i.status = 'paid')
             OR (i.amount_paid < i.amount_due AND i.amount_pending > 0) <> (i.status = 'declared')`,
      )
    ).rows as unknown[];

  beforeAll(async () => {
    f = await startLedgerFixture();
  });

  afterAll(() => f.stop());

  it(
    '300 déclarations et validations : soldes stockés = soldes recalculés depuis les répartitions',
    { timeout: 300_000 },
    async () => {
      const next = random(20261030);
      const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)] as T;
      const people = [
        { phone: '+2250711223344', firstName: 'Kofi', lastName: 'Annan', startsFrom: '2026-03-01' },
        { userId: USERS.moussa, startsFrom: '2026-03-01' },
      ];
      const enrollments: { id: string; userId: string }[] = [];
      for (const body of people) {
        const { id } = await f.enrollByApi(body);
        enrollments.push({ id, userId: await f.userOf(id) });
      }
      const pending: { id: string; enrollmentId: string; amount: number; proposed: Allocation[] }[] = [];
      const counts = { declared: 0, validated: 0, adjusted: 0, refused: 0 };

      // 300 opérations effectives (un tirage impossible, comme un trop-perçu, est retiré).
      for (let n = 0, done = 0; done < 300; n++) {
        if (n > 3000) throw new Error('tirage épuisé avant 300 opérations');
        if (pending.length === 0 || next() < 0.5) {
          const e = pick(enrollments);
          const amount = 1 + Math.floor(next() * 12_000);
          let proposed: Allocation[];
          try {
            proposed = proposeAllocation(amount, await ledgerOf(e.id));
          } catch {
            continue; // plus rien à déclarer sur cette inscription
          }
          const id = await f.record({
            enrollmentId: e.id,
            userId: e.userId,
            amount,
            status: 'pending',
            declaredAt: new Date(Date.UTC(2026, 9, 1) + n * 60_000).toISOString(),
            lines: proposed.map((a) => ({ ...a, state: 'proposed' })),
          });
          pending.push({ id, enrollmentId: e.id, amount, proposed });
          counts.declared++;
          done++;
        } else {
          const p = pick(pending);
          const view = excludingPayment(await ledgerOf(p.enrollmentId), p.proposed);
          const roll = next();
          let body: Record<string, unknown> = {};
          let ok = validateAllocation(p.amount, p.proposed, view, { enrollmentId: p.enrollmentId }).ok;
          if (roll < 0.4) {
            // Montant reçu différent, répartition ajustée (proposition gloutonne hors ce paiement).
            const received = 1 + Math.floor(next() * 12_000);
            let final: Allocation[];
            try {
              final = proposeAllocation(received, view);
            } catch {
              continue;
            }
            body = {
              amountReceived: xof(received),
              allocations: final.map((a) => ({ installmentId: a.installmentId, amount: xof(a.amount) })),
            };
            ok = validateAllocation(received, final, view, { enrollmentId: p.enrollmentId }).ok;
          } else if (roll < 0.6) {
            // Répartition qui ne totalise pas le montant : refusée, rien n'est écrit.
            const [first] = p.proposed;
            if (!first) continue;
            body = { allocations: [{ installmentId: first.installmentId, amount: xof(first.amount + p.amount) }] };
            ok = false;
          }
          const res = await f.call(`/associations/${A.id}/payments/${p.id}/validate`, {
            token: f.tokens.awa,
            method: 'POST',
            body,
            headers: { 'idempotency-key': crypto.randomUUID(), 'if-match': 'W/"1"' },
          });
          expect(res.status).toBe(ok ? 200 : 422);
          done++;
          if (res.status === 200) {
            pending.splice(pending.indexOf(p), 1);
            counts[roll < 0.4 ? 'adjusted' : 'validated']++;
          } else {
            counts.refused++;
          }
        }
        if (done % 50 === 0) expect(await drift()).toEqual([]);
      }

      expect(await drift()).toEqual([]);
      // Le tirage couvre bien chaque chemin.
      for (const value of Object.values(counts)) expect(value).toBeGreaterThan(5);
    },
  );
});
