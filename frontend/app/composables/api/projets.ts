import type { LigneGrilleProjet, NouveauProjet, Projet, SouscriptionAvecSouscripteur } from '~~/types'

export const useProjets = (filtres: MaybeRefOrGetter<{ associationId?: string, statut?: string }> = {}) =>
  useApi<Projet[]>('/projets', { query: filtres })

/** `immediat: false` : pas d'appel tant que `refresh()` n'est pas demandé (identifiant optionnel). */
export const useProjet = (id: MaybeRefOrGetter<string>, options: { immediat?: boolean } = {}) =>
  useApi<Projet>(() => `/projets/${toValue(id)}`, options)

/** Souscripteurs d'un projet (onglet Souscripteurs). */
export const useSouscripteursProjet = (id: MaybeRefOrGetter<string>) =>
  useApi<SouscriptionAvecSouscripteur[]>(() => `/projets/${toValue(id)}/souscripteurs`)

/** Grille d'échéances d'un projet (onglet Paiements). */
export const useGrilleProjet = (id: MaybeRefOrGetter<string>) =>
  useApi<LigneGrilleProjet[]>(() => `/projets/${toValue(id)}/echeances`)

/** Création d'un projet (MgNouveauProjet) : renvoie le projet créé. */
export function useCreationProjet() {
  const appel = useAppelApi()
  return (projet: NouveauProjet) => appel<Projet>('/projets', { body: projet })
}
