// GET /api/associations?statut= — liste (super-admin). Scénarios : `vide`.
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario) => {
  if (scenario === 'vide') return []
  const statut = filtre(event, 'statut')
  return store.associations.filter(a => !statut || a.statut === statut)
})
