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
  /**
   * Clé d'idempotence du dernier envoi et empreinte du contenu envoyé : un nouvel essai du même contenu (réponse perdue)
   * réutilise la clé, le back rejoue la même déclaration au lieu d'en créer une seconde ; contenu modifié → nouvelle clé.
   */
  envoi: { cle: string, empreinte: string } | null
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
    envoi: null,
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

  /** Clé d'idempotence de l'envoi de ce contenu (réutilisée tant qu'il ne change pas). */
  function cleEnvoi(contenu: unknown): string {
    const empreinte = JSON.stringify(contenu)
    if (etat.value.envoi?.empreinte !== empreinte) etat.value.envoi = { cle: crypto.randomUUID(), empreinte }
    return etat.value.envoi.cle
  }

  function reinitialiser() {
    etat.value = etatInitial()
  }

  return { etat, commencer, choisirProjet, cleEnvoi, reinitialiser }
}
