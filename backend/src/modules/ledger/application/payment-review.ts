import { allocations, installments, payments as t } from '@cotiz/db';
import {
  type Allocation,
  type Currency,
  installmentStatus,
  type LedgerInstallment,
  lateSinceOf,
  Money,
} from '@cotiz/domain';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { SubscriberAccounts } from '../../identity/identity.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { sqlErrorOf } from '../../../shared/logging/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import type { PaymentRecord } from './payment-views.js';

/**
 * Étapes communes à la relecture d'un paiement (lg.pay.validate, lg.pay.reject, lg.pay.revert ; architecture/04 § 4.5) :
 * verrous dans l'ordre paiement → projet → échéances par id (aucun cycle avec en.create, en.withdraw ni entre elles),
 * soldes et statuts réécrits depuis @cotiz/domain, contrôles différés de la base traduits en Problem.
 */

type InstallmentRecord = typeof installments.$inferSelect;
/** Refus des contrôles différés de la base (check_payment_allocations) : codes du catalogue, jamais un 500. */
const DEFERRED_CODES = new Set(['allocation_mismatch', 'invalid_state']);

/** Paiement de l'association verrouillé (FOR UPDATE) ; absent ou d'une autre association → 404. */
export async function lockPayment(associationId: string, payId: string): Promise<PaymentRecord> {
  const [row] = await currentTx()
    .select()
    .from(t)
    .where(and(eq(t.associationId, associationId), eq(t.id, payId)))
    .for('update');
  if (row?.associationId !== associationId) throw new DomainProblem('not_found');
  return row;
}

/** 409 avec le nom de la personne qui a traité le paiement (errors.yaml : reviewerName, paymentStatus). */
export async function alreadyReviewed(row: PaymentRecord, accounts: SubscriberAccounts): Promise<DomainProblem> {
  const reviewer = row.reviewedBy ? (await accounts.contactsOf([row.reviewedBy])).get(row.reviewedBy) : undefined;
  return new DomainProblem('payment_already_reviewed', {
    reviewerName: reviewer ? `${reviewer.firstName} ${reviewer.lastName}`.trim() : null,
    paymentStatus: row.status,
  });
}

/**
 * Échéances de l'inscription et celles visées ailleurs, verrouillées par id croissant puis relues (RLS : celles d'une
 * autre association restent invisibles). Montants en entiers de la devise du paiement.
 */
export async function lockInstallments(
  associationId: string,
  enrollmentId: string,
  currency: Currency,
  alsoIds: readonly string[] = [],
): Promise<LedgerInstallment[]> {
  const rows = await currentTx()
    .select()
    .from(installments)
    .where(
      and(
        eq(installments.associationId, associationId),
        or(
          eq(installments.enrollmentId, enrollmentId),
          alsoIds.length === 0 ? undefined : inArray(installments.id, [...alsoIds]),
        ),
      ),
    )
    .orderBy(asc(installments.id))
    .for('update');
  return rows.map((i) => toLedger(i, currency));
}

/** Répartitions d'un paiement dans un état (proposées, confirmées), montants en entiers de sa devise. */
export async function allocationsOf(
  associationId: string,
  paymentId: string,
  state: 'proposed' | 'confirmed',
  currency: Currency,
): Promise<Allocation[]> {
  return (
    await currentTx()
      .select({ installmentId: allocations.installmentId, amount: allocations.amount })
      .from(allocations)
      .where(
        and(
          eq(allocations.associationId, associationId),
          eq(allocations.paymentId, paymentId),
          eq(allocations.state, state),
        ),
      )
  ).map((a) => ({ installmentId: a.installmentId, amount: Money.fromDb(a.amount, currency).amount }));
}

/**
 * Répartition de la déclaration : les premières créées (même instant, une déclaration par transaction, avant toute
 * relecture ; comme declaredLines()), quel que soit leur état. Comparé en base, microsecondes comprises.
 */
export async function declaredAllocationsOf(
  associationId: string,
  paymentId: string,
  currency: Currency,
): Promise<Allocation[]> {
  const ofPayment = and(eq(allocations.associationId, associationId), eq(allocations.paymentId, paymentId));
  const first = currentTx()
    .select({ at: sql`min(${allocations.createdAt})` })
    .from(allocations)
    .where(ofPayment);
  return (
    await currentTx()
      .select({ installmentId: allocations.installmentId, amount: allocations.amount })
      .from(allocations)
      .where(and(ofPayment, eq(allocations.createdAt, sql`(${first})`)))
  ).map((a) => ({ installmentId: a.installmentId, amount: Money.fromDb(a.amount, currency).amount }));
}

/** Répartitions vivantes d'un paiement dans cet état passées `voided` (jamais supprimées). */
export async function voidAllocations(
  associationId: string,
  paymentId: string,
  state: 'proposed' | 'confirmed',
): Promise<void> {
  await currentTx()
    .update(allocations)
    .set({ state: 'voided' })
    .where(
      and(
        eq(allocations.associationId, associationId),
        eq(allocations.paymentId, paymentId),
        eq(allocations.state, state),
      ),
    );
}

/** Nouvelles répartitions d'un paiement (confirmées à la validation, proposées à l'annulation). */
export async function insertAllocations(
  row: PaymentRecord,
  lines: readonly Allocation[],
  state: 'proposed' | 'confirmed',
): Promise<void> {
  if (lines.length === 0) return;
  await currentTx()
    .insert(allocations)
    .values(
      lines.map((a) => ({
        associationId: row.associationId,
        paymentId: row.id,
        installmentId: a.installmentId,
        enrollmentId: row.enrollmentId,
        amount: BigInt(a.amount),
        state,
      })),
    );
}

/**
 * Soldes (calculés par moveAllocations) réécrits avec statut, date de retard (lateSinceOf : fait daté, gardé sous
 * `declared`) et date de solde (`paid_at` conservé s'il l'était déjà) au jour de l'association.
 */
export async function writeBalances(
  associationId: string,
  changed: readonly LedgerInstallment[],
  today: string,
  graceDays: number,
): Promise<void> {
  for (const i of changed) {
    const status = installmentStatus(i, today, graceDays);
    await currentTx()
      .update(installments)
      .set({
        amountPaid: BigInt(i.amountPaid),
        amountPending: BigInt(i.amountPending),
        status,
        lateSince: lateSinceOf(i, today, graceDays),
        paidAt: status === 'paid' ? sql`coalesce(${installments.paidAt}, now())` : null,
      })
      .where(and(eq(installments.associationId, associationId), eq(installments.id, i.id)));
  }
}

/** Contrôles différés (Σ confirmées = montant reçu…) vérifiés avant la fin du cas d'usage, traduits en Problem. */
export async function checkDeferred(): Promise<void> {
  try {
    await currentTx().execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
  } catch (error) {
    const pg = sqlErrorOf(error);
    if (pg?.code === 'P0001' && DEFERRED_CODES.has(pg.message)) {
      throw new DomainProblem(pg.message === 'allocation_mismatch' ? 'allocation_mismatch' : 'invalid_state');
    }
    throw error;
  }
}

/** Échéance vue par le domaine : montants en entiers de la devise du paiement. */
function toLedger(i: InstallmentRecord, currency: Currency): LedgerInstallment {
  return {
    id: i.id,
    enrollmentId: i.enrollmentId,
    kind: i.kind,
    sequence: i.sequence,
    dueDate: i.dueDate,
    amountDue: Money.fromDb(i.amountDue, currency).amount,
    amountPaid: Money.fromDb(i.amountPaid, currency).amount,
    amountPending: Money.fromDb(i.amountPending, currency).amount,
    status: i.status,
  };
}
