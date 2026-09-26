import type { DateISO, Identifiant } from './commun'
import type { TypeAssociation } from './association'

/** Demande de création d'association. Badges : À traiter · Approuvée · Refusée. */
export type StatutDemande = 'a_traiter' | 'approuvee' | 'refusee'

export interface Demande {
  id: Identifiant
  /** Numéro de référence affiché en police mono (confirmation, SaDemande). Format non fixé. */
  reference: string
  recueLe: DateISO
  statut: StatutDemande

  // Étape 1 — L'association
  association: {
    nom: string
    type: TypeAssociation
    ville: string
    pays: string
    numeroEnregistrement?: string
    description: string // 500 caractères max
  }

  // Étape 2 — Le responsable
  responsable: {
    prenom: string
    nom: string
    fonction: string
    email: string
    telephone: string
  }

  // Étape 3 — Vos besoins
  besoins: {
    souscripteursEstimes: string // sélecteur par tranches ; libellés des tranches à reprendre de la maquette
    projetsEnvisages: string // tranche du sélecteur (« 1 », « 2 à 3 »…) ; `[N]` dans les données de référence
    planSouhaiteId: Identifiant
    source: string // « Comment avez-vous connu Cotiz ? »
  }
  cguAcceptees: boolean

  // Décision (super-admin)
  planAttribueId?: Identifiant
  decideLe?: DateISO
  decidePar?: Identifiant
  motifRefus?: string // incertain : liste de motifs + texte libre
  associationId?: Identifiant // créée à l'approbation
}

/** Corps de `POST /api/demandes` (formulaire public `/demande`). */
export type NouvelleDemande = Pick<Demande, 'association' | 'responsable' | 'besoins' | 'cguAcceptees'>

/** Réponse de `POST /api/demandes`. */
export interface DemandeCreee {
  id: Identifiant
  reference: string
  /** Adresse à laquelle la réponse sera envoyée (page de confirmation). */
  email: string
}
