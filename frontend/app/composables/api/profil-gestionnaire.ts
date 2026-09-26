import type { ModificationProfilGestionnaire, ProfilGestionnaire } from '~~/types'

/** Profil du gestionnaire connecté (MgProfil). */
export const useProfilGestionnaire = () => useApi<ProfilGestionnaire>('/gestionnaire/profil')

/** Modification des informations et préférences, changement de mot de passe. */
export function useActionsProfilGestionnaire() {
  const appel = useAppelApi()
  return {
    modifier: (modification: ModificationProfilGestionnaire) =>
      appel<ProfilGestionnaire>('/gestionnaire/profil', { method: 'PATCH', body: modification }),
    changerMotDePasse: (actuel: string, nouveau: string) =>
      appel<ProfilGestionnaire>('/gestionnaire/profil/mot-de-passe', { body: { actuel, nouveau } }),
  }
}
