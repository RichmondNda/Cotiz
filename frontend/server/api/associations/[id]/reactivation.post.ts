// POST /api/associations/:id/reactivation — lève la suspension (retour au statut d'avant, « active » par défaut).
import { store } from '../../../mocks/store'

export default defineMockHandler((event) => {
  const a = store.associations.find(x => x.id === parametre(event, 'id')) ?? introuvable('Association')
  a.statut = store.suspensions[a.id]?.statutAvant ?? 'active'
  store.suspensions = Object.fromEntries(Object.entries(store.suspensions).filter(([id]) => id !== a.id))
  return ficheAssociation(a)
})
