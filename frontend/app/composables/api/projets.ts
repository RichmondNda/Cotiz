import type { LigneGrilleProjet, Projet, SouscriptionAvecSouscripteur } from '~~/types'

export const useProjets = (filtres: MaybeRefOrGetter<{ associationId?: string, statut?: string }> = {}) =>
  useApi<Projet[]>('/projets', { query: filtres })

export const useProjet = (id: MaybeRefOrGetter<string>) => useApi<Projet>(() => `/projets/${toValue(id)}`)

/** Souscripteurs d'un projet (onglet Souscripteurs). */
export const useSouscripteursProjet = (id: MaybeRefOrGetter<string>) =>
  useApi<SouscriptionAvecSouscripteur[]>(() => `/projets/${toValue(id)}/souscripteurs`)

/** Grille d'échéances d'un projet (onglet Paiements). */
export const useGrilleProjet = (id: MaybeRefOrGetter<string>) =>
  useApi<LigneGrilleProjet[]>(() => `/projets/${toValue(id)}/echeances`)
