import type { ApprobationDemande, Demande, DemandeCreee, DemandeDetaillee, NouvelleDemande, RefusDemande } from '~~/types'

/** Demandes de création (super-admin), plus anciennes d'abord. */
export const useDemandes = (filtres: MaybeRefOrGetter<{ statut?: string }> = {}) =>
  useApi<Demande[]>('/demandes', { query: filtres })

export const useDemande = (id: MaybeRefOrGetter<string>) => useApi<DemandeDetaillee>(() => `/demandes/${toValue(id)}`)

/** Décision sur une demande : approbation (crée l'espace de l'association) ou refus motivé. */
export function useDecisionDemande() {
  const appel = useAppelApi()
  return {
    approuver: (id: string, approbation: ApprobationDemande) =>
      appel<DemandeDetaillee>(`/demandes/${id}/approbation`, { body: approbation }),
    refuser: (id: string, refus: RefusDemande) => appel<DemandeDetaillee>(`/demandes/${id}/refus`, { body: refus }),
  }
}

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
