import type { Demande, DemandeCreee, NouvelleDemande } from '~~/types'

export const useDemandes = (filtres: MaybeRefOrGetter<{ statut?: string }> = {}) =>
  useApi<Demande[]>('/demandes', { query: filtres })

export const useDemande = (id: MaybeRefOrGetter<string>) => useApi<Demande>(() => `/demandes/${toValue(id)}`)

/** Dernière demande envoyée depuis ce navigateur (affichée par /demande/confirmation, perdue au rechargement). */
export const useDemandeEnvoyee = () => useState<DemandeCreee | null>('demande-envoyee', () => null)

/** Formulaire public `/demande` : `const envoyer = useEnvoiDemande()` dans `setup`. */
export function useEnvoiDemande() {
  const appel = useAppelApi()
  const envoyee = useDemandeEnvoyee()
  return async (demande: NouvelleDemande) => {
    envoyee.value = await appel<DemandeCreee>('/demandes', { body: demande })
    return envoyee.value
  }
}
