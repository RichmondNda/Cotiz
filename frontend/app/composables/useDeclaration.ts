// État partagé du parcours « Déclarer un paiement » (4 étapes sur une seule route : projet → montant → preuve →
// récapitulatif). Conservé tant que la déclaration n'est pas envoyée ou abandonnée, pour revenir en arrière sans perte.
import type { MoyenPaiement } from '~~/types'
import type { Repartition } from '~/utils/allocate'
import { maintenant } from '~/utils/date-reference'
import { formatDate } from '~/utils/format'

export const ETAPES_DECLARATION = ['Projet', 'Montant', 'Preuve', 'Récapitulatif'] as const

export interface EtatDeclaration {
  /** Étape courante, de 1 à 4. */
  etape: number
  projetId: string | null
  montant: number | null
  repartition: Repartition | null
  /** Date du versement saisie (JJ/MM/AAAA). */
  date: string
  moyen: MoyenPaiement | null
  /** Fichier de preuve choisi (nom et taille ; l'envoi du fichier viendra avec l'API). */
  preuve: { nom: string, taille: number } | null
  reference: string
  commentaire: string
}

function etatInitial(): EtatDeclaration {
  return {
    etape: 1,
    projetId: null,
    montant: null,
    repartition: null,
    date: formatDate(maintenant(), 'numerique'),
    moyen: null,
    preuve: null,
    reference: '',
    commentaire: '',
  }
}

export function useDeclaration() {
  const etat = useState<EtatDeclaration>('declaration-paiement', etatInitial)

  /** Nouvelle déclaration ; `projetId` fourni (depuis un projet) : l'étape « Projet » est sautée. */
  function commencer(projetId?: string) {
    etat.value = { ...etatInitial(), ...(projetId ? { projetId, etape: 2 } : {}) }
  }

  function choisirProjet(projetId: string) {
    if (etat.value.projetId === projetId) return
    etat.value = { ...etat.value, projetId, montant: null, repartition: null, moyen: null }
  }

  function reinitialiser() {
    etat.value = etatInitial()
  }

  return { etat, commencer, choisirProjet, reinitialiser }
}
