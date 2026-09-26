// GET /api/demandes?statut= — demandes de création (super-admin), plus récentes d'abord.
// Scénarios : `vide`, `aucune-demande` (aucune à traiter).
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario) => {
  if (scenario === 'vide') return []
  const statut = filtre(event, 'statut')
  return store.demandes
    .filter(d => !(scenario === 'aucune-demande' && d.statut === 'a_traiter'))
    .filter(d => !statut || d.statut === statut)
    .sort((a, b) => b.recueLe.localeCompare(a.recueLe))
})
