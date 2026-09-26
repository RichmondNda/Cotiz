// GET /api/projets/:id/souscripteurs — souscriptions du projet avec le souscripteur. Scénario : `aucun-souscripteur`.
import { store } from '../../../mocks/store'

export default defineMockHandler((event, scenario) => {
  const id = parametre(event, 'id')
  if (!store.projets.some(p => p.id === id)) introuvable('Projet')
  if (scenario === 'aucun-souscripteur') return []
  return store.souscriptions
    .filter(s => s.projetId === id)
    .map(s => ({ ...s, souscripteur: store.souscripteurs.find(p => p.id === s.souscripteurId)! }))
})
