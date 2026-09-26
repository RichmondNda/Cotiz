import type { Demande } from '~~/types'

export const useDemandes = (filtres: MaybeRefOrGetter<{ statut?: string }> = {}) =>
  useApi<Demande[]>('/demandes', { query: filtres })

export const useDemande = (id: MaybeRefOrGetter<string>) => useApi<Demande>(() => `/demandes/${toValue(id)}`)
