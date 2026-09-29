// POST /api/plans/:id/archivage — archive le plan : retiré de la landing, les abonnés actuels le conservent.
import { store } from '../../../mocks/store'

export default defineMockHandler((event) => {
  const plan = store.plans.find(p => p.id === parametre(event, 'id')) ?? introuvable('Plan')
  plan.statut = 'archive'
  plan.misEnAvant = false
  return plan
})
