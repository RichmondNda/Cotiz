// POST /api/plans — nouveau plan (SaPlan en création).
import type { ModificationPlan, Plan } from '~~/types'
import { store } from '../../mocks/store'

export default defineMockHandler(async (event) => {
  const corps = await readBody<ModificationPlan>(event)
  const donnees = planValide(corps)
  const plan: Plan = { ...donnees, id: slugUnique(donnees.nom, store.plans.map(p => p.id), 'plan'), associationsAbonnees: 0 }
  if (plan.misEnAvant) store.plans.forEach(p => (p.misEnAvant = false))
  store.plans.push(plan)
  return plan
})
