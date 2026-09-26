// POST /api/projets/:id/cloture — clôture définitive : projet « Terminé », échéances à venir annulées.
import { store } from '../../../mocks/store'

export default defineMockHandler((event) => {
  const projet = store.projets.find(p => p.id === parametre(event, 'id')) ?? introuvable('Projet')
  if (projet.statut === 'termine') erreurMetier(409, 'deja_cloture', 'Projet deja cloture')
  projet.statut = 'termine'
  store.echeances = store.echeances.filter(e => !(e.projetId === projet.id && e.statut === 'a_venir'))
  return projet
})
