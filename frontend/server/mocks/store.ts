// Store en mémoire des mocks : copie modifiable des données de référence, partagée par les handlers.
// Les mutations (valider un paiement, signer un contrat…) viendront avec les lots qui en ont besoin.
import type { Association, Contrat, Demande, Echeance, EnvoiRelance, Gestionnaire, Notification, Paiement, Plan, Projet, RegleRelance, Souscripteur, Souscription } from '~~/types'
import * as ref from './referentiel'
import { genererEcheances, paiementsEnAttente, paiementsMoussa, paiementsValidesCentre, rendreContrat } from './generation'

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
  /** Coordonnées vues par l'association (placeholders de la maquette), modifiables depuis la fiche. */
  coordonneesAssociation: Record<string, { email?: string, adresse?: string }>
  /** Relances envoyées par échéance en retard (frise de la fiche souscripteur). */
  relancesEcheances: typeof ref.RELANCES_ECHEANCES
  dernieresRelances: typeof ref.DERNIERES_RELANCES
  reglesRelance: RegleRelance[]
  envoisRelance: EnvoiRelance[]
}

function construire(): StoreMocks {
  const projet = (id: string) => ref.projets.find(p => p.id === id)!
  // Souscription en attente de signature (Fatou Traoré, inscrite en septembre) : pas d'échéance avant le mois
  // d'inscription (hors fonds d'entrée), comme dans la grille de la maquette.
  const attente = (s: string) => ref.souscriptions.find(x => x.projetId === 'centre-communautaire' && x.souscripteurId === s && x.statut === 'signature_attendue')
  const dues = (s: string) => (e: Echeance) => {
    const sc = attente(s)
    return !sc || e.estFondsEntree || e.date.slice(0, 7) >= sc.inscritLe.slice(0, 7)
  }
  const echeances = [
    ...Object.entries(ref.SEQUENCES_CENTRE).flatMap(([s, seq]) => genererEcheances(projet('centre-communautaire'), s, seq).filter(dues(s))),
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
    paiements: [...paiementsEnAttente(), ...paiementsValidesCentre(), ...paiementsMoussa()],
    contrats: ref.contrats.map((c) => {
      const association = ref.associations.find(a => a.id === c.associationId)!
      const principal = ref.gestionnaires.find(g => g.associationId === c.associationId && g.role === 'principal')
      return {
        ...c,
        texte: rendreContrat(projet(c.projetId), association, ref.souscripteurs.find(s => s.id === c.souscripteurId)!),
        signataireAssociation: principal ? [`${principal.prenom} ${principal.nom}`, principal.fonction].filter(Boolean).join(', ') : '[SIGNATAIRE]',
        signeParAssociationLe: c.signeParAssociationLe ?? '[DATE]',
      }
    }),
    notifications: ref.notifications,
    demandes: ref.demandes,
    coordonneesAssociation: ref.COORDONNEES_ASSOCIATION,
    relancesEcheances: ref.RELANCES_ECHEANCES,
    dernieresRelances: ref.DERNIERES_RELANCES,
    reglesRelance: ref.REGLES_RELANCE,
    envoisRelance: ref.ENVOIS_RELANCE,
  })
}

export const store: StoreMocks = construire()

/** Remet le store dans son état initial. */
export function reinitialiserStore() {
  Object.assign(store, construire())
}
