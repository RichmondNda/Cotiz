import type { Association, TableauDeBordGestionnaire } from '~~/types'

/** Tableau de bord du gestionnaire connecté (KPI du mois, collecte sur 6 mois, points à traiter). */
export const useTableauDeBordGestionnaire = () =>
  useApi<TableauDeBordGestionnaire>('/gestionnaire/tableau-de-bord')

/** Association du gestionnaire connecté (profil, moyens de paiement par défaut). */
export const useAssociationGestionnaire = () =>
  useApi<Association>('/gestionnaire/association', { cle: 'mon-association' })
