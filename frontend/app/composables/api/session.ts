import type { CompteursNavigation, UtilisateurSession } from '~~/types'

/** Utilisateur de la session mockée. */
export const useMoi = () => useApi<UtilisateurSession>('/session/moi', { cle: 'session-moi' })

/** Compteurs des menus (paiements à valider, notifications non lues, demandes à traiter). */
export const useCompteursNavigation = () =>
  useApi<CompteursNavigation>('/navigation/compteurs', { cle: 'compteurs-navigation' })
