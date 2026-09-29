// GET /api/demandes?statut= — demandes de création (super-admin), plus anciennes d'abord (ordre de traitement).
// Scénarios : `vide` (aucune à traiter), `aucune-demande` (idem).
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario) => {
  const statut = filtre(event, 'statut')
  return store.demandes
    .filter(d => !((scenario === 'vide' || scenario === 'aucune-demande') && d.statut === 'a_traiter'))
    .filter(d => !statut || d.statut === statut)
    .sort((a, b) => a.recueLe.localeCompare(b.recueLe))
})
