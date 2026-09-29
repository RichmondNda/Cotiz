// GET /api/associations/:id/fiche — détail plateforme (SaAssociation). Scénario : `etat-suspendue`.
import { store } from '../../../mocks/store'

export default defineMockHandler((event, scenario) => {
  const a = store.associations.find(x => x.id === parametre(event, 'id')) ?? introuvable('Association')
  return ficheAssociation(scenario === 'etat-suspendue' ? { ...a, statut: 'suspendue' } : a)
})
