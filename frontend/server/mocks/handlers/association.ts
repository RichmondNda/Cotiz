// Espace association (profil, moyens, onboarding et abonnement : NestJS, lot 2.1 ; contrats : lot 4.1 ; équipe : lot 4.5 ;
// factures bl.inv : lot 4.6).
import type { AssociationRow } from '../db'
import type { MockSession } from '../http'
import { problem, requireSession } from '../http'
import { associationRow } from '../views'

/** Association de la session gestionnaire (le contrôle `aid` = session est fait par l'enveloppe). */
export function sessionAssociation(ctx: { session: MockSession | null }): AssociationRow {
  return associationRow(requireSession(ctx).associationId ?? problem('forbidden'))
}
