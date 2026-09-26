// Espace plateforme : réservé au rôle « superadmin » de la session mockée ; sinon, page de connexion de l'espace.
import { CONNEXION_PAR_ROLE, useSession } from '~/composables/useSession'

export default defineNuxtRouteMiddleware((to) => {
  const { role } = useSession()
  if (role.value !== 'superadmin') {
    return navigateTo({ path: CONNEXION_PAR_ROLE.superadmin, query: { redirection: to.fullPath } })
  }
})
