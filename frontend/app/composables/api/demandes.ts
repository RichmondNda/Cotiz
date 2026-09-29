import type { ApprobationDemande, Demande, DemandeCreee, DemandeDetaillee, NouvelleDemande, RefusDemande } from '~~/types'

/** Demandes de création (super-admin), plus anciennes d'abord. */
export const useDemandes = (filtres: MaybeRefOrGetter<{ statut?: string }> = {}) =>
  useApi<Demande[]>('/demandes', { query: filtres })

export const useDemande = (id: MaybeRefOrGetter<string>) => useApi<DemandeDetaillee>(() => `/demandes/${toValue(id)}`)

/** Décision sur une demande : approbation (crée l'espace de l'association) ou refus motivé. */
export function useDecisionDemande() {
  const appel = useAppelApi()
  // Une décision retire la demande de « À traiter » : le badge « Demandes » du menu doit suivre.
  const { refresh: rechargerCompteurs } = useCompteursNavigation()
  async function decider(chemin: string, body: object) {
    const demande = await appel<DemandeDetaillee>(chemin, { body })
    await rechargerCompteurs()
    return demande
  }
  return {
    approuver: (id: string, approbation: ApprobationDemande) => decider(`/demandes/${id}/approbation`, approbation),
    refuser: (id: string, refus: RefusDemande) => decider(`/demandes/${id}/refus`, refus),
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
