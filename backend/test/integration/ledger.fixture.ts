import { ENDPOINTS } from '@cotiz/contracts';
import { expect } from 'vitest';
import { A } from '../isolation/harness.js';
import { type MembersFixture, PROJECTS, startMembersFixture } from './members.fixture.js';

/**
 * Jeu des tests du registre (lot 2.4) : celui des souscripteurs (lot 2.3), plus de quoi poser des paiements en base
 * comme les écriraient la déclaration (lot 3.3) et la relecture (lot 2.4), soldes des échéances compris.
 */

const Created = ENDPOINTS['en.create'].operations.create.response.body;

export interface Line {
  installmentId: string;
  amount: number;
  state: 'proposed' | 'confirmed' | 'voided';
  /** Déclaration (0) ou relecture (1) : ordre de création des répartitions. */
  round?: 0 | 1;
}

export interface PaymentInput {
  enrollmentId: string;
  userId: string;
  amount: number;
  status: 'pending' | 'validated' | 'rejected';
  declaredAt: string;
  lines: Line[];
  projectId?: string;
  associationId?: string;
  amountReceived?: number;
  reviewedBy?: string;
  reviewedAt?: string;
  rejection?: { code: string; message: string | null };
  proofFileId?: string;
  methodId?: string;
}

export interface LedgerFixture extends MembersFixture {
  /** en.create réussi : l'inscription du contrat. */
  enrollByApi: (body: unknown, options?: { aid?: string; pid?: string; token?: string }) => Promise<{ id: string }>;
  installmentOf: (enrollmentId: string, dueDate: string) => Promise<string>;
  userOf: (enrollmentId: string) => Promise<string>;
  /**
   * Paiement et ses répartitions en une instruction (contrôle différé au COMMIT), puis soldes des échéances : proposé
   * d'un paiement en attente → `amount_pending`, confirmé → `amount_paid` (échéance soldée : `paid`).
   */
  record: (p: PaymentInput) => Promise<string>;
  /** Preuve analysée de l'association (dépôt fait, rattachée). */
  proof: (ownerUserId: string) => Promise<string>;
  /** Paiements, répartitions, preuves, puis inscriptions et échéances effacés entre deux tests. */
  resetLedger: () => Promise<void>;
}

export async function startLedgerFixture(env: Record<string, string> = {}): Promise<LedgerFixture> {
  const f = await startMembersFixture(env);

  const enrollByApi: LedgerFixture['enrollByApi'] = async (body, options = {}) => {
    const res = await f.call(`/associations/${options.aid ?? A.id}/projects/${options.pid ?? PROJECTS.a}/enrollments`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body,
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(res.status).toBe(201);
    return Created.parse(await res.json()).enrollment;
  };
  const installmentOf: LedgerFixture['installmentOf'] = async (enrollmentId, dueDate) =>
    (
      (
        await f.h.superuser(`SELECT id FROM installments WHERE enrollment_id = $1 AND due_date = $2`, [
          enrollmentId,
          dueDate,
        ])
      ).rows as [{ id: string }]
    )[0].id;
  const userOf: LedgerFixture['userOf'] = async (enrollmentId) =>
    (
      (await f.h.superuser('SELECT user_id FROM enrollments WHERE id = $1', [enrollmentId])).rows as [
        { user_id: string },
      ]
    )[0].user_id;

  const record: LedgerFixture['record'] = async (p) => {
    const id = crypto.randomUUID();
    await f.h.superuser(
      `WITH p AS (
         INSERT INTO payments (id, association_id, project_id, enrollment_id, user_id, amount_declared, amount_received,
                               paid_on, payment_method_id, transaction_reference, proof_file_id, status, declared_at,
                               reviewed_by, reviewed_at, rejection_reason_code, rejection_message, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $19, ($7::timestamptz)::date, $8,
                 CASE WHEN $9::uuid IS NULL THEN 'REF-42' END, $9, $10::payments_status, $7, $11, $12, $13, $14,
                 gen_random_uuid()::text)
         RETURNING id)
       INSERT INTO allocations (id, association_id, payment_id, installment_id, enrollment_id, amount, state, created_at)
       SELECT gen_random_uuid(), $2, p.id, l.installment_id, $4, l.amount, l.state::allocations_state,
              $7::timestamptz + make_interval(mins => l.round)
         FROM p, unnest($15::uuid[], $16::bigint[], $17::text[], $18::int[]) AS l(installment_id, amount, state, round)`,
      [
        id,
        p.associationId ?? A.id,
        p.projectId ?? PROJECTS.a,
        p.enrollmentId,
        p.userId,
        p.amount,
        p.declaredAt,
        p.methodId ?? null,
        p.proofFileId ?? null,
        p.status,
        p.reviewedBy ?? null,
        p.reviewedAt ?? null,
        p.rejection?.code ?? null,
        p.rejection?.message ?? null,
        p.lines.map((l) => l.installmentId),
        p.lines.map((l) => l.amount),
        p.lines.map((l) => l.state),
        p.lines.map((l) => l.round ?? 0),
        p.amountReceived ?? null,
      ],
    );
    await f.h.superuser(
      `UPDATE installments i
          SET amount_pending = i.amount_pending + CASE WHEN $2 = 'pending' AND a.state = 'proposed' THEN a.amount ELSE 0 END,
              amount_paid = i.amount_paid + CASE WHEN a.state = 'confirmed' THEN a.amount ELSE 0 END
         FROM (SELECT installment_id, state, sum(amount) AS amount FROM allocations
                WHERE payment_id = $1 AND state <> 'voided' GROUP BY installment_id, state) a
        WHERE i.id = a.installment_id`,
      [id, p.status],
    );
    // Statut persisté comme le recalculerait installmentStatus() (domain-rules § 6, règles 2 et 3) : soldée → paid,
    // déclaré en attente → declared ; sinon celui posé par en.create.
    await f.h.superuser(
      `UPDATE installments
          SET status = CASE WHEN amount_paid >= amount_due THEN 'paid'::installments_status
                            WHEN amount_pending > 0 THEN 'declared'::installments_status ELSE status END,
              paid_at = CASE WHEN amount_paid >= amount_due THEN coalesce(paid_at, $2::timestamptz) ELSE paid_at END
        WHERE id IN (SELECT installment_id FROM allocations WHERE payment_id = $1)
          AND status NOT IN ('waived', 'canceled')`,
      [id, p.reviewedAt ?? null],
    );
    return id;
  };

  const proof: LedgerFixture['proof'] = async (ownerUserId) => {
    const id = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                          size_bytes, sha256, scan_status)
       VALUES ($1, $2, $3, 'payment_proof', 'cotiz-proofs', $4, 'capture.jpg', 'image/jpeg', 1024, 'abc', 'clean')`,
      [id, A.id, ownerUserId, `${A.id}/payment_proof/${id}.jpg`],
    );
    return id;
  };

  const resetLedger = async () => {
    await f.h.superuser('DELETE FROM allocations');
    await f.h.superuser('DELETE FROM payments');
    await f.h.superuser(`DELETE FROM files WHERE purpose = 'payment_proof'`);
    await f.resetMembers();
  };

  return { ...f, resetLedger, enrollByApi, installmentOf, userOf, record, proof };
}
