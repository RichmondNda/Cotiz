import type { Association, ModificationAssociation } from '~~/types'

export const useAssociations = (filtres: MaybeRefOrGetter<{ statut?: string }> = {}) =>
  useApi<Association[]>('/associations', { query: filtres })

export const useAssociation = (id: MaybeRefOrGetter<string>) =>
  useApi<Association>(() => `/associations/${toValue(id)}`)

/** Mise à jour du profil ou des moyens de paiement de l'association (onboarding, paramètres). */
export function useModificationAssociation() {
  const appel = useAppelApi()
  return (id: string, modification: ModificationAssociation) =>
    appel<Association>(`/associations/${id}`, { method: 'PATCH', body: modification })
}
