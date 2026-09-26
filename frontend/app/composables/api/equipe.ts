import type { EquipeAssociation, Gestionnaire, InvitationGestionnaire } from '~~/types'

/** Gestionnaires de l'association et quota de comptes secondaires (MgEquipe). */
export const useEquipe = () => useApi<EquipeAssociation>('/gestionnaire/equipe')

/** Invitation, renvoi des accès et retrait d'un gestionnaire secondaire. */
export function useActionsEquipe() {
  const appel = useAppelApi()
  return {
    inviter: (invitation: InvitationGestionnaire) => appel<Gestionnaire>('/gestionnaire/equipe', { body: invitation }),
    renvoyer: (id: string) => appel<{ envoye: boolean, email: string, type: 'invitation' | 'identifiants' }>(`/gestionnaire/equipe/${id}/renvoi`),
    retirer: (id: string) => appel<{ ok: boolean }>(`/gestionnaire/equipe/${id}`, { method: 'DELETE' }),
  }
}
