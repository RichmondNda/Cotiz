import type { ContratDetaille, SyntheseContratProjet } from '~~/types'

export const useContrats = (filtres: MaybeRefOrGetter<{ projetId?: string, souscripteurId?: string, statut?: string }> = {}) =>
  useApi<ContratDetaille[]>('/contrats', { query: filtres })

/** Contrats des projets de l'association du gestionnaire (MgContrats). */
export const useContratsProjets = () => useApi<SyntheseContratProjet[]>('/gestionnaire/contrats')
