import type { FicheSouscripteur, SouscripteurAnnuaire, SouscriptionComplete } from '~~/types'

/** Annuaire des souscripteurs de l'association. */
export const useSouscripteurs = (filtres: MaybeRefOrGetter<{ associationId?: string }> = {}) =>
  useApi<SouscripteurAnnuaire[]>('/souscripteurs', { query: filtres })

export const useSouscripteur = (id: MaybeRefOrGetter<string>) =>
  useApi<FicheSouscripteur>(() => `/souscripteurs/${toValue(id)}`)

/** Projets du souscripteur connecté (accueil, « Mes projets »). */
export const useMesSouscriptions = () => useApi<SouscriptionComplete[]>('/moi/souscriptions')
