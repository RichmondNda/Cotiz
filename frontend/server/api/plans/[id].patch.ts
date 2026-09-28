// PATCH /api/plans/:id — modification d'un plan (s'applique aux abonnés à leur prochaine échéance).
import type { ModificationPlan } from '~~/types'
import { store } from '../../mocks/store'

export default defineMockHandler(async (event) => {
  const plan = store.plans.find(p => p.id === parametre(event, 'id')) ?? introuvable('Plan')
  const donnees = planValide(await readBody<ModificationPlan>(event))
  if (donnees.misEnAvant) store.plans.forEach(p => (p.misEnAvant = false))
  Object.assign(plan, donnees)
  return plan
})
