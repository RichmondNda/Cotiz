// GET /api/gestionnaire/abonnement — formule, utilisation des quotas et factures de l'association.
// Scénarios : `echeance-proche` (facture en cours à payer), `suspendu` (facture impayée, espace suspendu).
import type { AbonnementAssociation, StatutAbonnement, StatutFactureAbonnement } from '~~/types'
import { ABONNEMENT_ENTRAIDE } from '../../../mocks/referentiel'
import { store } from '../../../mocks/store'
import { gestionnaireSession, membresEquipe } from '../../../utils/equipe'

const FACTURE_EN_COURS: Record<StatutAbonnement, StatutFactureAbonnement> = {
  actif: 'payee', echeance_proche: 'a_payer', suspendu: 'impayee',
}

export default defineMockHandler((event, scenario): AbonnementAssociation => {
  const { associationId } = gestionnaireSession(event)
  const association = store.associations.find(a => a.id === associationId) ?? introuvable('Association')
  const plan = store.plans.find(p => p.id === association.planId) ?? introuvable('Plan')
  const statut: StatutAbonnement = scenario === 'suspendu' || association.statut === 'suspendue' || association.statut === 'impayee'
    ? 'suspendu'
    : scenario === 'echeance-proche' ? 'echeance_proche' : 'actif'
  const a = ABONNEMENT_ENTRAIDE
  const factures = a.factures.map((f, i) => ({ ...f, statut: i === 0 ? FACTURE_EN_COURS[statut] : 'payee' as const }))
  return {
    planId: plan.id,
    nomPlan: plan.nom,
    prixAnnuel: plan.prixAnnuel,
    statut,
    clientDepuis: a.clientDepuis,
    prochaineFacture: association.abonnementProchaineEcheance ?? a.prochaineFacture,
    moyenPaiement: a.moyenPaiement,
    utilisation: {
      projets: { utilise: association.nbProjets, limite: plan.quotas.projets, pourcentage: a.pourcentages.projets },
      souscripteurs: { utilise: association.nbSouscripteurs, limite: plan.quotas.souscripteurs, pourcentage: a.pourcentages.souscripteurs },
      gestionnaires: { utilise: membresEquipe(associationId).length, limite: plan.quotas.gestionnaires, pourcentage: a.pourcentages.gestionnaires },
    },
    factures,
    factureDue: statut === 'actif' ? undefined : { numero: factures[0]!.numero, echeance: association.abonnementProchaineEcheance ?? '[DATE]' },
    emailContactCotiz: a.emailContactCotiz,
    changementDemande: store.changementsFormuleDemandes.includes(associationId),
  }
})
