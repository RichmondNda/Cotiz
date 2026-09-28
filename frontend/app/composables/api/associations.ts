import type {
  Association,
  AssociationListe,
  FicheAssociationPlateforme,
  ListeAssociations,
  ModificationAssociation,
  NouvelleAssociationPlateforme,
  SuspensionAssociation,
} from '~~/types'

/** Liste plateforme des associations et compteurs des puces (super-admin). */
export const useAssociations = (filtres: MaybeRefOrGetter<{ statut?: string, plan?: string, q?: string }> = {}) =>
  useApi<ListeAssociations>('/associations', { query: filtres })

export const useAssociation = (id: MaybeRefOrGetter<string>) =>
  useApi<Association>(() => `/associations/${toValue(id)}`)

/** Fiche plateforme d'une association (SaAssociation). */
export const useFicheAssociation = (id: MaybeRefOrGetter<string>) =>
  useApi<FicheAssociationPlateforme>(() => `/associations/${toValue(id)}/fiche`)

/** Mise à jour du profil ou des moyens de paiement de l'association (onboarding, paramètres). */
export function useModificationAssociation() {
  const appel = useAppelApi()
  return (id: string, modification: ModificationAssociation) =>
    appel<Association>(`/associations/${id}`, { method: 'PATCH', body: modification })
}

/** Actions plateforme sur une association : création directe, suspension, réactivation, plan et comptes. */
export function useActionsAssociationPlateforme() {
  const appel = useAppelApi()
  return {
    creer: (nouvelle: NouvelleAssociationPlateforme) => appel<AssociationListe>('/associations', { body: nouvelle }),
    suspendre: (id: string, suspension: SuspensionAssociation) =>
      appel<FicheAssociationPlateforme>(`/associations/${id}/suspension`, { body: suspension }),
    reactiver: (id: string) => appel<FicheAssociationPlateforme>(`/associations/${id}/reactivation`),
    changerAbonnement: (id: string, changement: { planId?: string, comptesGestionnaires?: number }) =>
      appel<FicheAssociationPlateforme>(`/associations/${id}/plan`, { body: changement }),
  }
}
