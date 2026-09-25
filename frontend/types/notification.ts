import type { DateISO, Identifiant } from './commun'

/** Incertain : liste déduite des exemples (spec 4.11, MbNotifications, MgNotifications). */
export type TypeNotification
  = | 'echeance_proche'
    | 'echeance_en_retard'
    | 'paiement_declare'
    | 'paiement_valide'
    | 'paiement_rejete'
    | 'contrat_a_signer'
    | 'contrat_signe'
    | 'relance'
    | 'abonnement'

export interface Notification {
  id: Identifiant
  destinataireId: Identifiant
  type: TypeNotification
  titre: string // « Paiement validé »
  message: string // « Entraide Yopougon a confirmé la réception de 75 000 F »
  creeeLe: DateISO // groupement Aujourd'hui / Cette semaine / Plus ancien
  lue: boolean
  /** Route de l'écran d'action ouvert au clic. */
  lien?: string
}
