// GET /api/plateforme/tableau-de-bord — SaDashboard. Scénario : `aucune-demande`.
import type { TableauDeBordPlateforme } from '~~/types'
import { store } from '../../mocks/store'
import { A_SURVEILLER, ACTIVITE_PLATEFORME, EVOLUTION_ASSOCIATIONS, KPI_PLATEFORME } from '../../mocks/plateforme'

export default defineMockHandler((_event, scenario): TableauDeBordPlateforme => {
  const aTraiter = scenario === 'aucune-demande'
    ? []
    : store.demandes.filter(d => d.statut === 'a_traiter').sort((a, b) => a.recueLe.localeCompare(b.recueLe))
  return {
    demandesATraiter: aTraiter.length,
    demandesPrioritaires: aTraiter.slice(0, 3),
    kpi: KPI_PLATEFORME,
    evolution: EVOLUTION_ASSOCIATIONS,
    repartition: store.plans.filter(p => p.statut === 'actif').map(p => ({ planId: p.id, nom: p.nom, nombre: p.associationsAbonnees })),
    aSurveiller: A_SURVEILLER,
    activite: ACTIVITE_PLATEFORME,
  }
})
