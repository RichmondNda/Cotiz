import type { DateISO, Identifiant, MontantFCFA, MoyenPaiement } from './commun'
import type { RepartitionEcheance } from './echeance'

/** Paiement déclaré. Badges : En attente · Validé · Rejeté. */
export type StatutPaiement = 'en_attente' | 'valide' | 'rejete'

/** Motifs proposés dans la modale de rejet. */
export type MotifRejet = 'preuve_illisible' | 'montant_non_recu' | 'montant_different' | 'autre'

/** Preuve jointe : image, PDF, ou seulement une référence de transaction. */
/** `fichierId` : fichier déposé (fl.get), absent d'une preuve d'exemple ; `url` reste `[URL]` tant qu'il n'est pas lu. */
export type Preuve
  = | { type: 'image', nomFichier: string, url: string, fichierId?: string, reference?: string }
    | { type: 'pdf', nomFichier: string, url: string, fichierId?: string, reference?: string }
    | { type: 'reference', reference: string }

/** Déclaration de paiement d'un souscripteur, vérifiée puis validée ou rejetée par un gestionnaire. */
export interface Paiement {
  id: Identifiant
  souscripteurId: Identifiant
  projetId: Identifiant
  associationId: Identifiant
  montant: MontantFCFA // montant déclaré
  /** Saisi par le gestionnaire via « Le montant reçu est différent ». */
  montantRecu?: MontantFCFA
  moyen: MoyenPaiement
  dateVirement?: DateISO // incertain : date indiquée par le souscripteur (« vers le 10 septembre »)
  declareLe: DateISO
  preuve: Preuve
  /** Commentaire libre du souscripteur (« versement fait par mon frère »). */
  commentaire?: string
  repartition: RepartitionEcheance[]
  /** true si le gestionnaire a modifié la répartition proposée. */
  repartitionAjustee: boolean
  statut: StatutPaiement
  traiteLe?: DateISO
  traitePar?: Identifiant // gestionnaire (« validé par Aminata K. »)
  motifRejet?: MotifRejet
  messageRejet?: string
}
