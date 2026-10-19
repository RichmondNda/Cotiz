// Espace plateforme (basculé vers le vrai back au lot 1.1, rendu dans le navigateur) : un jeton d'accès de l'espace
// plateforme en mémoire, sinon un renouvellement silencieux par le cookie ; à défaut, page de connexion. Le cookie
// simulé `cotiz_role` est posé aussi : les écrans plateforme encore simulés (lots 1.3, 1.4) en tirent leur session.
import { COOKIE_ROLE, CONNEXION_PAR_ROLE } from '~/composables/useSession'
import { espaceDuJeton } from '~/utils/jeton-acces'

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const jeton = useJetonAcces()
  const pret = jeton.valeur() || (await jeton.renouveler())
  // Une session d'un autre espace n'ouvre pas l'interface plateforme (le back refuserait de toute façon ses données).
  if (!pret || espaceDuJeton(jeton.valeur()) !== 'platform') {
    return navigateTo({ path: CONNEXION_PAR_ROLE.superadmin, query: { redirection: to.fullPath } })
  }
  const role = useCookie<string | null>(COOKIE_ROLE, { default: () => null, sameSite: 'lax', path: '/' })
  if (role.value !== 'superadmin') role.value = 'superadmin'
})
