import type { ModificationPlan, Plan } from '~~/types'

/** Plans d'abonnement ; `statut: 'actif'` pour l'offre publique (landing, demande). */
export const usePlans = (filtres: MaybeRefOrGetter<{ statut?: 'actif' | 'archive' }> = {}) =>
  useApi<Plan[]>('/plans', { query: filtres })

export const usePlan = (id: MaybeRefOrGetter<string>, options: { immediat?: boolean } = {}) =>
  useApi<Plan>(() => `/plans/${toValue(id)}`, options)

/** Gestion de l'offre (super-admin) : créer, modifier, dupliquer, archiver un plan. */
export function useActionsPlan() {
  const appel = useAppelApi()
  return {
    creer: (plan: ModificationPlan) => appel<Plan>('/plans', { body: plan }),
    modifier: (id: string, plan: ModificationPlan) => appel<Plan>(`/plans/${id}`, { method: 'PATCH', body: plan }),
    dupliquer: (id: string) => appel<Plan>(`/plans/${id}/duplication`),
    archiver: (id: string) => appel<Plan>(`/plans/${id}/archivage`),
    desarchiver: (id: string) => appel<Plan>(`/plans/${id}/desarchivage`),
  }
}
