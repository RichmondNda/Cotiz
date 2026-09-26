// Formes des réponses de l'API (mocks Nitro en V0, NestJS ensuite) quand elles joignent plusieurs ressources.
import type { Association } from './association'
import type { Contrat } from './contrat'
import type { Echeance } from './echeance'
import type { Paiement } from './paiement'
import type { Projet } from './projet'
import type { Souscripteur, Souscription } from './souscripteur'

export type SouscriptionAvecSouscripteur = Souscription & { souscripteur: Souscripteur }
export type SouscriptionAvecProjet = Souscription & { projet: Projet }
export type SouscriptionComplete = Souscription & { projet: Projet, association: Association }

export interface LigneGrilleProjet {
  souscription: Souscription
  souscripteur: Souscripteur
  echeances: Echeance[]
}

export interface FicheSouscripteur {
  souscripteur: Souscripteur
  souscriptions: SouscriptionAvecProjet[]
}

export type PaiementListe = Paiement & { souscripteur: Souscripteur, projet: Projet }
export type PaiementDetail = PaiementListe & { echeances: Echeance[] }

export type ContratDetaille = Contrat & { projet: Projet, souscripteur: Souscripteur, association: Association }
