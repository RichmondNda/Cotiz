import type { Plan } from '~~/types'

export const usePlans = () => useApi<Plan[]>('/plans')

export const usePlan = (id: MaybeRefOrGetter<string>) => useApi<Plan>(() => `/plans/${toValue(id)}`)
