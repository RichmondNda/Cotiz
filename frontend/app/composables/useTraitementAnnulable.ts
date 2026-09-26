// Validation et rejet d'un paiement déclaré par le gestionnaire, communs à la file de validation et au détail :
// appel de l'API, suite propre à l'écran (paiement suivant, navigation), rechargement des données de l'écran et des
// compteurs de navigation, toast de succès avec « Annuler » pendant 10 s (le paiement repasse en attente).
import type { RejetPaiement, ValidationPaiement } from '~~/types'

interface OptionsTraitement {
  /** Texte du toast de succès. */
  message: string
  /** Suite propre à l'écran, avant le rechargement (sélectionner le suivant, naviguer). */
  puis?: () => unknown
  annulation: {
    /** Texte du toast « Action annulée ». */
    message: string
    /** Suite propre à l'écran après l'annulation, avant le rechargement (revenir au paiement). */
    puis?: () => unknown
  }
}

const DUREE_ANNULATION = 10_000

export function useTraitementAnnulable(recharger: () => Promise<unknown>) {
  const { valider, rejeter, annuler } = useTraitementPaiement()
  const { refresh: rechargerCompteurs } = useCompteursNavigation()
  const toast = useToast()

  /** Traitement en cours : paiement et action (boutons en chargement, double clic ignoré). */
  const envoi = ref<{ id: string, action: 'valider' | 'rejeter' } | null>(null)
  const actualiser = () => Promise.all([recharger(), rechargerCompteurs()])

  async function annulerTraitement(id: string, options: OptionsTraitement['annulation']) {
    try {
      await annuler(id)
      await options.puis?.()
      await actualiser()
      toast.info('Action annulée', { message: options.message })
    }
    catch {
      toast.erreur('Impossible d’annuler', { message: 'Le délai d’annulation est dépassé ou le paiement a changé.' })
    }
  }

  async function traiter(action: 'valider' | 'rejeter', id: string, appel: () => Promise<unknown>, options: OptionsTraitement): Promise<boolean> {
    if (envoi.value) return false
    envoi.value = { id, action }
    try {
      await appel()
      await options.puis?.()
      await actualiser()
      toast.succes(action === 'valider' ? 'Paiement validé' : 'Paiement rejeté', {
        message: options.message,
        duree: DUREE_ANNULATION,
        action: { label: 'Annuler', rappel: () => annulerTraitement(id, options.annulation) },
      })
      return true
    }
    catch {
      toast.erreur(action === 'valider' ? 'Le paiement n’a pas pu être validé' : 'Le paiement n’a pas pu être rejeté', {
        message: 'Vérifiez votre connexion, puis réessayez.',
      })
      return false
    }
    finally {
      envoi.value = null
    }
  }

  return {
    envoi,
    validerPaiement: (id: string, corps: ValidationPaiement, options: OptionsTraitement) =>
      traiter('valider', id, () => valider(id, corps), options),
    rejeterPaiement: (id: string, corps: RejetPaiement, options: OptionsTraitement) =>
      traiter('rejeter', id, () => rejeter(id, corps), options),
  }
}
