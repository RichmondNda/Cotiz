import type { DateISO, Identifiant, MontantFCFA } from './commun'

/** Situation d'un souscripteur sur un projet. Badges : Signature attendue · À jour · En retard. */
export type StatutSouscription = 'signature_attendue' | 'a_jour' | 'en_retard'

export interface Souscripteur {
  id: Identifiant
  prenom: string
  nom: string
  telephone: string // `+225 07 08 09 10 11`
  email?: string
  adresse?: string
  avatarUrl?: string
  /** Associations dont il est membre (Moussa Diarra : 2). */
  associationIds: Identifiant[]
  membreDepuis: DateISO
}

/** Inscription d'un souscripteur à un projet (ligne de l'onglet Souscripteurs, carte de la fiche). */
export interface Souscription {
  id: Identifiant
  souscripteurId: Identifiant
  projetId: Identifiant
  inscritLe: DateISO
  contratId?: Identifiant
  contratSigneLe?: DateISO // absent = « en attente »
  verse: MontantFCFA
  reste: MontantFCFA
  engagement: MontantFCFA // total dû sur le projet
  statut: StatutSouscription
  /** Montant à régulariser (retards). Ex. Moussa / Centre : 50 000 F. */
  montantEnRetard: MontantFCFA
  /** Retiré du projet par le gestionnaire (historique conservé, plus d'échéances à venir). */
  retireLe?: DateISO
}

/** Vue annuaire (MgSouscripteurs) : statut global = le pire de ses projets. */
export interface SouscripteurAnnuaire extends Souscripteur {
  projetIds: Identifiant[]
  totalVerse: MontantFCFA | '[MONTANT]'
  totalReste: MontantFCFA | '[MONTANT]'
  statutGlobal: StatutSouscription
}
