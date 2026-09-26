// GET /api/projets/:id/echeances — grille : une ligne par souscripteur avec ses échéances.
import { store } from '../../../mocks/store'

export default defineMockHandler((event) => {
  const id = parametre(event, 'id')
  if (!store.projets.some(p => p.id === id)) introuvable('Projet')
  return store.souscriptions
    .filter(s => s.projetId === id)
    .map(s => ({
      souscription: s,
      souscripteur: store.souscripteurs.find(p => p.id === s.souscripteurId)!,
      echeances: store.echeances.filter(e => e.projetId === id && e.souscripteurId === s.souscripteurId),
    }))
})
