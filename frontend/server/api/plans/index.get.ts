// GET /api/plans?statut= — plans d'abonnement (landing et demande : `statut=actif`). Scénario : `aucun-plan`.
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario) => {
  if (scenario === 'aucun-plan') return []
  const statut = filtre(event, 'statut')
  return store.plans.filter(p => !statut || p.statut === statut)
})
