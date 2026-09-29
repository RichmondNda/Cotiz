import type {
  FacturationPlateforme,
  ModificationProfilPlateforme,
  ProfilPlateforme,
  TableauDeBordPlateforme,
  UtilisateurPlateforme,
} from '~~/types'

/** Tableau de bord plateforme (SaDashboard). */
export const useTableauDeBordPlateforme = () => useApi<TableauDeBordPlateforme>('/plateforme/tableau-de-bord')

/** Facturation globale (aperçu V2). */
export const useFacturationPlateforme = (options: { immediat?: boolean } = {}) =>
  useApi<FacturationPlateforme>('/plateforme/factures', options)

/** Équipe interne de Cotiz (aperçu V2). */
export const useUtilisateursPlateforme = (options: { immediat?: boolean } = {}) =>
  useApi<UtilisateurPlateforme[]>('/plateforme/utilisateurs', options)

/** Profil du super-admin connecté (SaProfil). */
export const useProfilPlateforme = () => useApi<ProfilPlateforme>('/plateforme/profil')

export function useActionsProfilPlateforme() {
  const appel = useAppelApi()
  return {
    modifier: (modification: ModificationProfilPlateforme) =>
      appel<ProfilPlateforme>('/plateforme/profil', { method: 'PATCH', body: modification }),
    changerMotDePasse: (actuel: string, nouveau: string) =>
      appel<ProfilPlateforme>('/plateforme/profil/mot-de-passe', { body: { actuel, nouveau } }),
  }
}
