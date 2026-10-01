// Notifications de la personne connectée (nt.list, nt.read).
import type { Notification, TypeNotification } from '~~/types'
import { local } from './vues/communs'

/** Type d'événement (events.yaml) → type de l'interface (icône, regroupement). */
const TYPES: Record<string, TypeNotification> = {
  'contract.to_sign': 'contrat_a_signer', 'contract.signed': 'contrat_signe', 'installment.late': 'echeance_en_retard',
  'installment.due_soon': 'echeance_proche', 'payment.declared': 'paiement_declare', 'payment.validated': 'paiement_valide',
  'payment.rejected': 'paiement_rejete', 'reminder.sent': 'relance', 'billing.invoice': 'abonnement', 'enrollment.created': 'inscriptions',
}

export const useNotifications = () =>
  useLecture<Notification[]>('notifications', async (client) => {
    const me = await client.call('me', 'get')
    const { items } = await toutesLesPages(cursor => client.call('nt.list', 'list', { query: { limit: 100, cursor } }))
    return items.map(n => ({
      id: n.id, destinataireId: me.user.id, type: TYPES[n.type] ?? 'relance', titre: n.title, message: n.body, creeeLe: local(n.createdAt),
      lue: n.readAt !== null, ...(n.actionUrl ? { lien: n.actionUrl } : {}),
      ...(typeof n.data.actionLabel === 'string' ? { libelleAction: n.data.actionLabel } : {}),
    }))
  })

/**
 * Lecture des notifications : `ouvrir` marque une notification lue (au clic, avant la navigation),
 * `toutLire` marque tout comme lu puis recharge la liste. Les compteurs de navigation (cloche) suivent.
 */
export function useLectureNotifications(recharger: () => Promise<unknown>) {
  const client = useClient()
  const { refresh: rafraichirCompteurs } = useCompteursNavigation()
  const envoi = ref(false)

  async function ouvrir(n: Notification) {
    if (n.lue) return
    n.lue = true
    try {
      await client.call('nt.read', 'read', { params: { id: n.id } })
    }
    finally {
      rafraichirCompteurs()
    }
  }

  async function toutLire() {
    envoi.value = true
    try {
      await client.call('nt.read', 'readAll')
      await Promise.all([recharger(), rafraichirCompteurs()])
    }
    finally {
      envoi.value = false
    }
  }

  return { ouvrir, toutLire, envoi }
}
