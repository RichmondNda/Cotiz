// Store en mémoire des mocks : copie modifiable des données de référence, partagée par les handlers.
// Les mutations (valider un paiement, signer un contrat…) viendront avec les lots qui en ont besoin.
import type { Association, Contrat, Demande, Echeance, Gestionnaire, Notification, Paiement, Plan, Projet, Souscripteur, Souscription } from '~~/types'
import * as ref from './referentiel'
import { genererEcheances, paiementsEnAttente, paiementsMoussa } from './generation'

export interface StoreMocks {
  plans: Plan[]
  associations: Association[]
  gestionnaires: Gestionnaire[]
  projets: Projet[]
  souscripteurs: Souscripteur[]
  souscriptions: Souscription[]
  echeances: Echeance[]
  paiements: Paiement[]
  contrats: Contrat[]
  notifications: Notification[]
  demandes: Demande[]
}

function construire(): StoreMocks {
  const projet = (id: string) => ref.projets.find(p => p.id === id)!
  const echeances = [
    ...Object.entries(ref.SEQUENCES_CENTRE).flatMap(([s, seq]) => genererEcheances(projet('centre-communautaire'), s, seq)),
    ...Object.entries(ref.SEQUENCES_MUTUELLE).flatMap(([s, seq]) => genererEcheances(projet('mutuelle-sante'), s, seq)),
  ]
  return structuredClone({
    plans: ref.plans,
    associations: ref.associations,
    gestionnaires: ref.gestionnaires,
    projets: ref.projets,
    souscripteurs: ref.souscripteurs,
    souscriptions: ref.souscriptions,
    echeances,
    paiements: [...paiementsEnAttente(), ...paiementsMoussa()],
    contrats: ref.contrats,
    notifications: ref.notifications,
    demandes: ref.demandes,
  })
}

export const store: StoreMocks = construire()

/** Remet le store dans son état initial. */
export function reinitialiserStore() {
  Object.assign(store, construire())
}
