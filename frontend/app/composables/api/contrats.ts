import type { ContratDetaille } from '~~/types'

export const useContrats = (filtres: MaybeRefOrGetter<{ projetId?: string, souscripteurId?: string, statut?: string }> = {}) =>
  useApi<ContratDetaille[]>('/contrats', { query: filtres })
