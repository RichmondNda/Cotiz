// Relances (SMS) de souscripteurs d'un projet, depuis le détail du projet : vue d'ensemble, grille, souscripteurs,
// contrat. Retient qui a déjà été relancé (« Relancé ✓ ») et qui est en cours d'envoi, affiche le toast du résultat.
import { pluriel } from '~/utils/format'

export function useRelancesProjet(projetId: MaybeRefOrGetter<string>) {
  const { relancer: envoyer } = useActionsProjet()
  const toast = useToast()

  const relances = ref<string[]>([])
  /** Souscripteur en cours de relance (bouton en chargement). */
  const envoi = ref<string | null>(null)

  /**
   * Relance `ids`. `nom` : relance individuelle (« Moussa Diarra a reçu un rappel par SMS. ») ;
   * `message` remplace le texte du toast. Renvoie `true` si l'envoi a réussi.
   */
  async function relancer(ids: string[], options: { nom?: string, message?: string } = {}): Promise<boolean> {
    envoi.value = ids.length === 1 ? ids[0]! : null
    try {
      const r = await envoyer(toValue(projetId), ids)
      relances.value = [...new Set([...relances.value, ...ids])]
      toast.succes(r.envoyees > 1 ? 'Relances envoyées' : 'Relance envoyée', {
        message: options.message
          ?? (options.nom ? `${options.nom} a reçu un rappel par SMS.` : `${pluriel(r.envoyees, 'souscripteur')} relancés par SMS.`),
      })
      return true
    }
    catch {
      toast.erreur('La relance n’a pas pu être envoyée', { message: 'Vérifiez votre connexion, puis réessayez.' })
      return false
    }
    finally {
      envoi.value = null
    }
  }

  return { relances, envoi, relancer }
}
