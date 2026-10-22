// Garde des espaces protégés (middlewares espace-*). Espace basculé vers le vrai back (plateforme au lot 1.1,
// gestionnaire et souscripteur au lot 1.2 ; pages rendues dans le navigateur) : un jeton d'accès de cet espace en
// mémoire, sinon un renouvellement silencieux par le cookie ; à défaut, page de connexion. Le cookie simulé
// `cotiz_role` est posé aussi : les écrans encore simulés en tirent leur session. Espace encore simulé : le cookie seul.
// Type de `to` pris chez Nuxt : pnpm installe plusieurs exemplaires de vue-router (pairs différents), dont les types ne
// se mélangent pas.
import type { RouteMiddleware } from '#app'
import type { Role } from '~~/types'
import { COOKIE_ROLE, CONNEXION_PAR_ROLE } from '~/composables/useSession'
import { espaceBascule, type Espace } from '~/utils/bascule'
import { espaceDuJeton } from '~/utils/jeton-acces'

const ESPACE: Record<Role, Espace> = { souscripteur: 'subscriber', gestionnaire: 'association', superadmin: 'platform' }

export async function gardeEspace(role: Role, to: Parameters<RouteMiddleware>[0]) {
  const connexion = { path: CONNEXION_PAR_ROLE[role], query: { redirection: to.fullPath } }
  const cookie = useCookie<string | null>(COOKIE_ROLE, { default: () => null, sameSite: 'lax', path: '/' })
  if (!espaceBascule(ESPACE[role])) {
    if (cookie.value !== role) return navigateTo(connexion)
    return
  }
  if (import.meta.server) return
  const jeton = useJetonAcces()
  const pret = jeton.valeur() || (await jeton.renouveler())
  // Une session d'un autre espace n'ouvre pas celui-ci (le back refuserait de toute façon ses données).
  if (!pret || espaceDuJeton(jeton.valeur()) !== ESPACE[role]) return navigateTo(connexion)
  if (cookie.value !== role) cookie.value = role
}
