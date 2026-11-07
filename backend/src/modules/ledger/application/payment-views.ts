import type { PaymentSummary } from '@cotiz/contracts';
import { allocations, files, installments, type payments } from '@cotiz/db';
import { type Currency, Money } from '@cotiz/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { SubscriberAccounts } from '../../identity/identity.public.js';
import { type ProjectRecord, projectsOf } from '../../projects/projects.public.js';
import { type PaymentMethodRecord, paymentMethodsOf } from '../../tenancy/tenancy.public.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

export type PaymentRecord = typeof payments.$inferSelect;
type AllocationRecord = typeof allocations.$inferSelect;
type Covered = PaymentSummary['covered'][number];
/** Répartition d'un paiement, avec son échéance. */
export type PaymentLine = AllocationRecord & { kind: Covered['kind']; sequence: number; dueDate: string };

/** Ce qu'il faut pour présenter des paiements de l'association du contexte : projets, personnes, moyens, preuves. */
export interface PaymentRefs {
  projects: Map<string, ProjectRecord>;
  people: Map<string, { id: string; firstName: string; lastName: string }>;
  methods: Map<string, PaymentMethodRecord>;
  proofs: Map<string, { name: string; mimeType: string }>;
  /** Répartitions de chaque paiement, dans l'ordre de création (déclaration, puis relecture). */
  lines: Map<string, PaymentLine[]>;
}

/** Références des paiements (RLS du contexte : rien d'une autre association), lues l'une après l'autre. */
export async function paymentRefsOf(
  associationId: string,
  rows: readonly PaymentRecord[],
  accounts: SubscriberAccounts,
): Promise<PaymentRefs> {
  const tx = currentTx();
  const ids = rows.map((r) => r.id);
  const projects = await projectsOf(
    associationId,
    rows.map((r) => r.projectId),
  );
  // Souscripteurs et relecteurs (gestionnaires de l'association) : seuls leurs noms sont présentés.
  const people = await accounts.contactsOf([
    ...new Set(rows.flatMap((r) => (r.reviewedBy ? [r.userId, r.reviewedBy] : [r.userId]))),
  ]);
  const methods = new Map(
    rows.some((r) => r.paymentMethodId) ? (await paymentMethodsOf(associationId)).map((m) => [m.id, m]) : [],
  );
  const proofIds = rows.flatMap((r) => (r.proofFileId ? [r.proofFileId] : []));
  const proofs =
    proofIds.length === 0
      ? []
      : await tx
          .select({ id: files.id, name: files.originalName, mimeType: files.mimeType })
          .from(files)
          .where(and(eq(files.associationId, associationId), inArray(files.id, proofIds)));
  const lines = await paymentLinesOf(ids);
  return {
    projects,
    people: new Map(
      [...people.values()].map((p) => [p.id, { id: p.id, firstName: p.firstName, lastName: p.lastName }]),
    ),
    methods,
    proofs: new Map(proofs.map((p) => [p.id, { name: p.name, mimeType: p.mimeType }])),
    lines,
  };
}

/** Répartitions de ces paiements (RLS du contexte), avec leur échéance, dans l'ordre de création (déclaration, puis relecture). */
export async function paymentLinesOf(ids: readonly string[]): Promise<Map<string, PaymentLine[]>> {
  const lines = new Map<string, PaymentLine[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return lines;
  const allocated = await currentTx()
    .select({
      allocation: allocations,
      kind: installments.kind,
      sequence: installments.sequence,
      dueDate: installments.dueDate,
    })
    .from(allocations)
    .innerJoin(installments, eq(installments.id, allocations.installmentId))
    .where(inArray(allocations.paymentId, [...ids]))
    .orderBy(asc(allocations.createdAt), asc(installments.kind), asc(installments.sequence));
  for (const a of allocated) {
    lines
      .get(a.allocation.paymentId)
      ?.push({ ...a.allocation, kind: a.kind, sequence: a.sequence, dueDate: a.dueDate });
  }
  return lines;
}

/**
 * Répartitions de la déclaration : les premières créées (la relecture vient après). Repose sur `created_at = now()`
 * (un instant par transaction) et sur une déclaration faite dans sa propre transaction, avant toute relecture.
 */
export function declaredLines(lines: readonly PaymentLine[]): PaymentLine[] {
  const first = lines[0]?.createdAt.getTime();
  return lines.filter((l) => l.createdAt.getTime() === first);
}

/**
 * Échéances couvertes : en attente, la répartition proposée ; validé, la répartition confirmée ; rejeté ou annulé,
 * celle de la déclaration (toutes annulées). Dans l'ordre de l'échéancier.
 */
export function coveredOf(row: PaymentRecord, lines: readonly PaymentLine[], currency: Currency): Covered[] {
  const shown =
    row.status === 'pending'
      ? lines.filter((l) => l.state === 'proposed')
      : row.status === 'validated'
        ? lines.filter((l) => l.state === 'confirmed')
        : declaredLines(lines);
  return shown
    .map((l) => ({
      installmentId: l.installmentId,
      kind: l.kind,
      sequence: l.sequence,
      dueDate: l.dueDate,
      amount: Money.fromDb(l.amount, currency),
      state: l.state,
    }))
    .sort((a, b) => (a.kind === b.kind ? a.sequence - b.sequence : a.kind === 'entry_fee' ? -1 : 1));
}

/** Paiement de la file (PaymentSummary) ; références chargées par paymentRefsOf(). */
export function paymentSummary(row: PaymentRecord, refs: PaymentRefs): PaymentSummary {
  const project = refs.projects.get(row.projectId);
  const member = refs.people.get(row.userId);
  const reviewer = row.reviewedBy ? refs.people.get(row.reviewedBy) : null;
  if (!project || !member || reviewer === undefined) throw new Error(`paiement ${row.id} : références introuvables`);
  const currency = row.currency as Currency;
  const proof = row.proofFileId ? refs.proofs.get(row.proofFileId) : undefined;
  return {
    id: row.id,
    status: row.status,
    amountDeclared: Money.fromDb(row.amountDeclared, currency),
    amountReceived: row.amountReceived === null ? null : Money.fromDb(row.amountReceived, currency),
    paidOn: row.paidOn,
    declaredAt: row.declaredAt.toISOString(),
    paymentMethodKind: (row.paymentMethodId ? refs.methods.get(row.paymentMethodId)?.kind : null) ?? null,
    member,
    project: { id: project.id, name: project.name },
    covered: coveredOf(row, refs.lines.get(row.id) ?? [], currency),
    proof: {
      fileId: row.proofFileId,
      fileName: proof?.name ?? null,
      mimeType: proof?.mimeType ?? null,
      transactionReference: row.transactionReference,
    },
    reviewedBy: reviewer,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}
