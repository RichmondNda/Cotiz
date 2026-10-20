// Plans d'abonnement : offre publique (pub.plans) et gestion par la plateforme (pf.plans, pf.plan.write, pf.plan.archive).
import type { ModificationPlan, Plan } from '~~/types'
import { codePlan, versPlanInput, vuePlans } from './vues/plans'

/** Plans d'abonnement ; `statut: 'actif'` pour l'offre publique (landing, demande). */
export const usePlans = (filtres: MaybeRefOrGetter<{ statut?: 'actif' | 'archive' }> = {}) =>
  useLecture<Plan[]>(() => `plans:${JSON.stringify(toValue(filtres))}`, async (client) => {
    const statut = toValue(filtres).statut
    if (statut === 'actif') return vuePlans((await client.call('pub.plans', 'list')).items)
    const plans = vuePlans((await client.call('pf.plans', 'list')).items)
    return statut ? plans.filter(p => p.statut === statut) : plans
  })

/** Un plan (SaPlan) : pas d'opération unitaire au contrat, lu dans la liste. */
export const usePlan = (id: MaybeRefOrGetter<string>, options: { immediat?: boolean } = {}) =>
  useLecture<Plan>(() => `plan:${toValue(id)}`, async (client) => {
    const plan = vuePlans((await client.call('pf.plans', 'list')).items).find(p => p.id === toValue(id))
    if (!plan) throw createError({ statusCode: 404, statusMessage: 'Plan introuvable' })
    return plan
  }, options)

/** Gestion de l'offre (super-admin) : créer, modifier, dupliquer, archiver un plan. */
export function useActionsPlan() {
  const client = useClient()
  const tous = async () => vuePlans((await client.call('pf.plans', 'list')).items)
  const vue = async (id: string) => (await tous()).find(p => p.id === id)!
  return {
    creer: async (plan: ModificationPlan) => {
      const cree = await client.call('pf.plan.write', 'create', { body: { ...versPlanInput(plan, await tous()), code: codePlan(plan.nom) } })
      return vue(cree.id)
    },
    modifier: async (id: string, plan: ModificationPlan) => {
      const actuel = await vue(id)
      await client.call('pf.plan.write', 'patch', { params: { id }, body: versPlanInput(plan, await tous()), ifMatch: actuel.version ?? 1 })
      return vue(id)
    },
    dupliquer: async (id: string) => vue((await client.call('pf.plan.archive', 'duplicate', { params: { id } })).id),
    archiver: async (id: string) => vue((await client.call('pf.plan.archive', 'archive', { params: { id } })).id),
    /** Annule l'archivage (« Annuler » du message) : le plan redevient actif. */
    desarchiver: async (id: string) => {
      const actuel = await vue(id)
      await client.call('pf.plan.write', 'patch', { params: { id }, body: { isActive: true }, ifMatch: actuel.version ?? 1 })
      return vue(id)
    },
  }
}
