// Réglages de notification du souscripteur (me.prefs, lot 4.2) : par type, « Dans l'application » et « Notifications
// push » (ui-deviations : SMS / email masqués tant que non activés). Cloche des types « action requise » toujours
// active (interrupteur grisé), comme le back. Réglage absent : activé.
import type { ApiClient } from './client'

export interface ReglageNotification {
  type: string
  titre: string
  /** La cloche de ce type ne se coupe pas. */
  obligatoire: boolean
  inApp: boolean
  /** `null` : pas de push pour ce type, ou push non proposé. */
  push: boolean | null
}

/** Types reçus par un souscripteur, dans l'ordre de l'écran ; `push` : prévu par la matrice des notifications. */
const CATALOGUE = [
  { type: 'payment.validated', titre: 'Paiement validé', obligatoire: false, push: true },
  { type: 'payment.rejected', titre: 'Déclaration rejetée', obligatoire: true, push: true },
  { type: 'installment.due_soon', titre: 'Échéance dans 3 jours', obligatoire: false, push: true },
  { type: 'installment.late', titre: 'Échéance en retard', obligatoire: true, push: true },
  { type: 'member.enrolled', titre: 'Ajout à un projet', obligatoire: false, push: true },
  { type: 'contract.signature_required', titre: 'Contrat à signer', obligatoire: true, push: false },
] as const

async function lire(client: ApiClient) {
  const prefs = await client.call('me.prefs', 'get')
  const pushPropose = prefs.availableChannels.includes('push')
  const valeur = (type: string, canal: 'in_app' | 'push') =>
    prefs.items.find(x => x.type === type && x.channel === canal)?.enabled ?? true
  const reglages: ReglageNotification[] = CATALOGUE.map(c => ({
    type: c.type,
    titre: c.titre,
    obligatoire: c.obligatoire,
    inApp: c.obligatoire || valeur(c.type, 'in_app'),
    push: c.push && pushPropose ? valeur(c.type, 'push') : null,
  }))
  return { reglages, pushPropose }
}

export const useReglagesNotifications = () => useLecture('reglages-notifications', lire)

/** Enregistre un interrupteur : l'ensemble des réglages est renvoyé (me.prefs › replace), celui-ci modifié. */
export function useActionReglageNotification() {
  const client = useClient()
  return async (type: string, canal: 'in_app' | 'push', enabled: boolean) => {
    const prefs = await client.call('me.prefs', 'get')
    const items = prefs.items.filter(x => !(x.type === type && x.channel === canal))
    items.push({ type, channel: canal, enabled })
    await client.call('me.prefs', 'replace', { body: { items } })
  }
}
