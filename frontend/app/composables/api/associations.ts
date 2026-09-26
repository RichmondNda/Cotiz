import type { Association } from '~~/types'

export const useAssociations = (filtres: MaybeRefOrGetter<{ statut?: string }> = {}) =>
  useApi<Association[]>('/associations', { query: filtres })

export const useAssociation = (id: MaybeRefOrGetter<string>) =>
  useApi<Association>(() => `/associations/${toValue(id)}`)
