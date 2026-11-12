// Espace association : factures (équipe : NestJS, lot 4.5 ; profil, moyens, onboarding et abonnement : NestJS, lot 2.1 ; contrats : lot 4.1).
import { db } from '../db'
import type { AssociationRow } from '../db'
import type { MockContext, MockSession } from '../http'
import { problem, requireSession } from '../http'
import { monthOf, today } from '../ledger'
import { associationRow, money } from '../views'
import { page } from './list'

/** Association de la session gestionnaire (le contrôle `aid` = session est fait par l'enveloppe). */
export function sessionAssociation(ctx: { session: MockSession | null }): AssociationRow {
  return associationRow(requireSession(ctx).associationId ?? problem('forbidden'))
}

// ---------------------------------------------------------------- Abonnement et factures

export function invoices(ctx: MockContext<'bl.inv', 'list'>) {
  let rows = db.invoices.filter(i => i.associationId === ctx.params.aid).sort((a, b) => b.periodStart.localeCompare(a.periodStart))
  // Échéance proche : facture d'octobre à régler avant le 5 ; suspendu : facture de septembre impayée.
  if (ctx.scenario === 'echeance-proche') rows = rows.map(i => (i.status === 'open' ? { ...i, dueAt: `${today()}T00:00:00Z` } : i))
  if (ctx.scenario === 'suspendu') rows = rows.map(i => (i.periodStart.startsWith(monthOf(today())) ? { ...i, status: 'overdue' as const, paidAt: null } : i))
  return page(rows.map(i => ({
    id: i.id, number: i.number, periodStart: i.periodStart, periodEnd: i.periodEnd, amount: money(i.amount), status: i.status,
    issuedAt: i.issuedAt, dueAt: i.dueAt, paidAt: i.paidAt, pdfFileId: null,
  })), ctx.query)
}
