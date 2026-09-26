// GET /api/projets/:id/echeances — grille : une ligne par souscripteur actif avec ses échéances.
// Scénarios : `beaucoup-de-retards`, `aucun-retard`, `termine`.
import { store } from '../../../mocks/store'

export default defineMockHandler((event, scenario) => {
  const id = parametre(event, 'id')
  projetGestionnaire(id)
  return souscriptionsActives(id).map(s => ({
    souscription: s,
    souscripteur: store.souscripteurs.find(p => p.id === s.souscripteurId)!,
    echeances: echeancesProjet(id, s.souscripteurId, scenario),
  }))
})
