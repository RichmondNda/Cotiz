// Toasts éphémères : bas droite en desktop, haut en mobile, 5 s, pause au survol.
// Action « Annuler » après une validation ou un retrait : `toast.succes('Paiement validé', { message, action: { label: 'Annuler', rappel } })`.
import type { NomIcone } from '~/utils/icons'

export type TonToast = 'success' | 'danger' | 'warning' | 'info'

export interface Toast {
  id: number
  ton: TonToast
  titre: string
  message?: string
  action?: { label: string, rappel: () => void }
  duree: number
  icone?: NomIcone
}

type OptionsToast = Partial<Omit<Toast, 'id' | 'ton' | 'titre'>>

let compteur = 0

export function useToast() {
  const toasts = useState<Toast[]>('cz-toasts', () => [])

  function afficher(ton: TonToast, titre: string, options: OptionsToast = {}) {
    const toast: Toast = { id: ++compteur, ton, titre, duree: 5000, ...options }
    toasts.value = [...toasts.value, toast]
    return toast.id
  }

  function retirer(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return {
    toasts,
    afficher,
    retirer,
    succes: (titre: string, o?: OptionsToast) => afficher('success', titre, o),
    erreur: (titre: string, o?: OptionsToast) => afficher('danger', titre, o),
    alerte: (titre: string, o?: OptionsToast) => afficher('warning', titre, o),
    info: (titre: string, o?: OptionsToast) => afficher('info', titre, o),
  }
}
