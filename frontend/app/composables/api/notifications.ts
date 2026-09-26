import type { Notification } from '~~/types'

export const useNotifications = () => useApi<Notification[]>('/notifications')

/**
 * Lecture des notifications : `ouvrir` marque une notification lue (au clic, avant la navigation),
 * `toutLire` marque tout comme lu puis recharge la liste. Les compteurs de navigation (cloche) suivent.
 */
export function useLectureNotifications(recharger: () => Promise<unknown>) {
  const appeler = useAppelApi()
  const { refresh: rafraichirCompteurs } = useCompteursNavigation()
  const envoi = ref(false)

  async function ouvrir(n: Notification) {
    if (n.lue) return
    n.lue = true
    try {
      await appeler(`/notifications/${n.id}`, { method: 'PATCH' })
    }
    finally {
      rafraichirCompteurs()
    }
  }

  async function toutLire() {
    envoi.value = true
    try {
      await appeler('/notifications/tout-lu')
      await Promise.all([recharger(), rafraichirCompteurs()])
    }
    finally {
      envoi.value = false
    }
  }

  return { ouvrir, toutLire, envoi }
}
