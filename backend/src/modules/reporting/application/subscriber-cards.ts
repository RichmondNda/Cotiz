import type { AssociationRef, SubscriberProjectCard } from '@cotiz/contracts';
import {
  bySubscriberCardOrder,
  type Currency,
  enrollmentLate,
  enrollmentNextDue,
  enrollmentProgress,
  enrollmentTotals,
  memberStanding,
  Money,
  type SubscriberInstallment,
} from '@cotiz/domain';
import type { SubscriberEnrollment } from '../../members/members.public.js';

/** Référence d'association présentée au souscripteur. */
export function associationRefOf(e: SubscriberEnrollment): AssociationRef {
  return { id: e.association.id, name: e.association.name, logoFileId: e.association.logoFileId };
}

/** Échéances générées avec leurs montants et statut calculés (même ordre que `lines`). */
function installmentsOf(e: SubscriberEnrollment): SubscriberInstallment[] {
  return e.lines.map((line, i) => {
    const state = e.states[i];
    if (!state) throw new Error(`inscription ${e.row.id} : état d’échéance manquant`);
    return { kind: line.kind, sequence: line.sequence, dueDate: line.dueDate, lateFrom: line.lateFrom, ...state };
  });
}

/**
 * Carte projet du souscripteur (SubscriberProjectCard) : mêmes totaux que la vue gestionnaire (`enrollmentTotals` sur
 * les mêmes états, engagement d'une inscription en attente de signature compris), situation par `memberStanding`
 * (le compte connecté est activé), retard et prochaine échéance par @cotiz/domain.
 */
export function subscriberCard(e: SubscriberEnrollment): SubscriberProjectCard {
  const currency = e.project.currency as Currency;
  const money = (amount: number) => Money.of(amount, currency);
  const totals = enrollmentTotals(e.totalsStates, e.project.scheduleType);
  const installments = installmentsOf(e);
  const late = enrollmentLate(installments);
  const next = enrollmentNextDue(installments);
  return {
    enrollmentId: e.row.id,
    project: { id: e.project.id, name: e.project.name, status: e.project.status },
    association: associationRefOf(e),
    standing: memberStanding(
      e.row.status,
      e.states.map((s) => s.status),
    ),
    paid: money(totals.paid),
    remaining: money(totals.remaining),
    commitment: totals.commitment === null ? null : money(totals.commitment),
    progress: enrollmentProgress(totals.paid, totals.commitment),
    late: late ? { count: late.count, amount: money(late.amount), since: late.since } : null,
    nextDue: next ? { dueDate: next.dueDate, amount: money(next.amount) } : null,
  };
}

/** Inscriptions et leur carte, triées comme le tableau de bord : retard, signature, prochaine échéance. */
export function sortedCards(
  entries: readonly SubscriberEnrollment[],
): { entry: SubscriberEnrollment; card: SubscriberProjectCard }[] {
  const order = (e: { entry: SubscriberEnrollment; card: SubscriberProjectCard }) => ({
    standing: e.card.standing,
    nextDueDate: e.card.nextDue?.dueDate ?? null,
    createdAt: e.entry.project.createdAt.toISOString(),
  });
  return entries
    .map((entry) => ({ entry, card: subscriberCard(entry) }))
    .sort((a, b) => bySubscriberCardOrder(order(a), order(b)));
}
