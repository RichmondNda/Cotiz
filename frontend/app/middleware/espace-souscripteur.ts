// Espace souscripteur : réservé au rôle « souscripteur » de la session mockée ; sinon, page de connexion de l'espace.
import { CONNEXION_PAR_ROLE, useSession } from '~/composables/useSession'

export default defineNuxtRouteMiddleware((to) => {
  const { role } = useSession()
  if (role.value !== 'souscripteur') {
    return navigateTo({ path: CONNEXION_PAR_ROLE.souscripteur, query: { redirection: to.fullPath } })
  }
})
