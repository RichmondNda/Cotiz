// POST /api/plans/:id/desarchivage — annule l'archivage (« Annuler » du message de confirmation).
import { store } from '../../../mocks/store'

export default defineMockHandler((event) => {
  const plan = store.plans.find(p => p.id === parametre(event, 'id')) ?? introuvable('Plan')
  plan.statut = 'actif'
  return plan
})
