// Espace gestionnaire : réservé au rôle « gestionnaire » de la session mockée ; sinon, page de connexion de l'espace.
import { CONNEXION_PAR_ROLE, useSession } from '~/composables/useSession'

export default defineNuxtRouteMiddleware((to) => {
  const { role } = useSession()
  if (role.value !== 'gestionnaire') {
    return navigateTo({ path: CONNEXION_PAR_ROLE.gestionnaire, query: { redirection: to.fullPath } })
  }
})
