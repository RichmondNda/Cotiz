// Session : rôle dans le cookie `cotiz_role` (session simulée des espaces encore sur mocks ; le script de capture le
// pose pour ouvrir un espace protégé). Espace basculé (plateforme, lot 1.1) : vraie session en plus, jeton d'accès en
// mémoire (useJetonAcces), fermée par auth.logout à la déconnexion.
// Les pages de connexion appellent `connecter(role)` ; les middlewares `espace-*` redirigent sinon.
import type { Role } from '~~/types'
import { espaceBascule } from '~/utils/bascule'
import { fermerSession } from '~/utils/jeton-acces'

export const COOKIE_ROLE = 'cotiz_role'

const ESPACE_PAR_ROLE = { souscripteur: 'subscriber', gestionnaire: 'association', superadmin: 'platform' } as const

/** Canal des onglets du navigateur : une déconnexion ferme la session partout. */
export const CANAL_SESSION = 'cotiz-session'

function annoncerDeconnexion() {
  if (import.meta.client && 'BroadcastChannel' in window) {
    const canal = new BroadcastChannel(CANAL_SESSION)
    canal.postMessage('deconnexion')
    canal.close()
  }
}

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
    if (ancien && espaceBascule(ESPACE_PAR_ROLE[ancien])) {
      // Vraie session : fermée côté serveur (connexion révoquée, cookie de renouvellement effacé), jeton expiré compris ;
      // les autres onglets sont prévenus (plugin session-onglets).
      await fermerSession(globalThis.fetch.bind(globalThis), useJetonAcces())
      annoncerDeconnexion()
    }
    cookie.value = null
    await navigateTo(ancien ? CONNEXION_PAR_ROLE[ancien] : '/')
  }

  return { role, estConnecte: computed(() => role.value !== null), connecter, deconnecter }
}
