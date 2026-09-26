import type { AbonnementAssociation } from '~~/types'

/** Formule, utilisation et factures de l'association (MgAbonnement). */
export const useAbonnement = () => useApi<AbonnementAssociation>('/gestionnaire/abonnement')

/** « Demander un changement » de formule : l'équipe Cotiz recontacte l'association. */
export function useDemandeChangementFormule() {
  const appel = useAppelApi()
  return () => appel<{ ok: boolean }>('/gestionnaire/abonnement/changement')
}
