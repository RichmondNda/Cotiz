// GET /api/associations/:id — détail. Scénario : `etat-suspendue`.
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario) => {
  const a = store.associations.find(x => x.id === parametre(event, 'id')) ?? introuvable('Association')
  return scenario === 'etat-suspendue' ? { ...a, statut: 'suspendue' as const } : a
})
