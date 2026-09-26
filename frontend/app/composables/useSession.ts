// Session mockée (V0) : le rôle est stocké dans le cookie `cotiz_role`
// (le script de capture le pose pour ouvrir directement un espace protégé).
// Les pages de connexion appellent `connecter(role)` ; les middlewares `espace-*` redirigent sinon.
import type { Role } from '~~/types'

export const COOKIE_ROLE = 'cotiz_role'

/** Page de connexion de chaque espace. */
export const CONNEXION_PAR_ROLE: Record<Role, string> = {
  souscripteur: '/connexion',
  gestionnaire: '/connexion/association',
  superadmin: '/connexion/plateforme',
}

/** Page d'accueil de chaque espace. */
export const ACCUEIL_PAR_ROLE: Record<Role, string> = {
  souscripteur: '/accueil',
  gestionnaire: '/asso',
  superadmin: '/plateforme',
}

export function useSession() {
  const cookie = useCookie<Role | null>(COOKIE_ROLE, { default: () => null, sameSite: 'lax', path: '/' })

  const role = computed<Role | null>(() => {
    const v = cookie.value
    return v === 'souscripteur' || v === 'gestionnaire' || v === 'superadmin' ? v : null
  })

  async function connecter(nouveau: Role, redirection?: string) {
    cookie.value = nouveau
    await navigateTo(redirection ?? ACCUEIL_PAR_ROLE[nouveau])
  }

  async function deconnecter() {
    const ancien = role.value
    cookie.value = null
    await navigateTo(ancien ? CONNEXION_PAR_ROLE[ancien] : '/')
  }

  return { role, estConnecte: computed(() => role.value !== null), connecter, deconnecter }
}
