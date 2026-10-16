// Jeton d'accès des espaces basculés (architecture/03) : JWT de 15 min gardé EN MÉMOIRE (jamais dans un cookie ni le
// stockage du navigateur), renouvelé par le cookie HttpOnly `cotiz_refresh` (POST /api/v1/auth/refresh).
// Le back fait tourner le cookie à chaque renouvellement et traite un ancien cookie comme un vol (toute la connexion
// est révoquée) : un seul renouvellement à la fois, dans l'onglet (promesse partagée) et entre onglets (Web Locks).

/** Verrou entre onglets (`navigator.locks`), absent des navigateurs anciens. */
export interface Verrous {
  request: <T>(nom: string, fn: () => Promise<T>) => Promise<T>
}

export interface JetonAcces {
  valeur: () => string | null
  definir: (jeton: string | null) => void
  /** `true` si un nouveau jeton est en mémoire ; `false` : plus de session (reconnexion). */
  renouveler: () => Promise<boolean>
}

const VERROU = 'cotiz-renouvellement'
const RENOUVELLEMENT = '/api/v1/auth/refresh'

export function creerJetonAcces(options: { fetch: typeof globalThis.fetch, locks?: Verrous }): JetonAcces {
  let jeton: string | null = null
  let enCours: Promise<boolean> | null = null

  async function appeler(): Promise<boolean> {
    try {
      const r = await options.fetch(RENOUVELLEMENT, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json, application/problem+json' },
      })
      if (!r.ok) {
        jeton = null
        return false
      }
      const corps = (await r.json()) as { accessToken?: unknown }
      jeton = typeof corps.accessToken === 'string' ? corps.accessToken : null
      return jeton !== null
    }
    catch {
      jeton = null
      return false
    }
  }

  return {
    valeur: () => jeton,
    definir: (nouveau) => {
      jeton = nouveau
    },
    renouveler: () => {
      enCours ??= (options.locks ? options.locks.request(VERROU, appeler) : appeler()).finally(() => {
        enCours = null
      })
      return enCours
    },
  }
}

/**
 * `fetch` du client d'API : une réponse 401 à une requête portant le jeton d'accès (expiré) déclenche un
 * renouvellement, puis la requête est rejouée une fois avec le nouveau jeton. Jamais pour les endpoints
 * d'authentification (renouvellement, connexion, déconnexion), ni sans jeton.
 */
export function fetchAvecRenouvellement(reseau: typeof globalThis.fetch, jeton: JetonAcces): typeof globalThis.fetch {
  return async (entree, init = {}) => {
    const reponse = await reseau(entree, init)
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url
    const enTetes = new Headers(init.headers)
    if (reponse.status !== 401 || !enTetes.has('authorization') || url.includes('/api/v1/auth/')) return reponse
    if (!(await jeton.renouveler())) return reponse
    enTetes.set('authorization', `Bearer ${jeton.valeur() ?? ''}`)
    return reseau(entree, { ...init, headers: enTetes })
  }
}

/** Espace du jeton d'accès (claim `space`), lu sans vérification : seulement pour l'interface ; le back vérifie. */
export function espaceDuJeton(jeton: string | null): string | null {
  const charge = jeton?.split('.')[1]
  if (!charge) return null
  try {
    const base64 = charge.replace(/-/g, '+').replace(/_/g, '/')
    const espace = (JSON.parse(atob(base64)) as { space?: unknown }).space
    return typeof espace === 'string' ? espace : null
  }
  catch {
    return null
  }
}

/**
 * Déconnexion d'une vraie session : `auth.logout` révoque la connexion et efface le cookie de renouvellement. Il exige
 * un jeton d'accès valide : jeton absent ou expiré (onglet resté inactif), il est renouvelé d'abord, sinon le cookie
 * survivrait et rouvrirait la session sans mot de passe. Renvoie `false` s'il n'y avait plus de session à fermer.
 */
export async function fermerSession(reseau: typeof globalThis.fetch, jeton: JetonAcces): Promise<boolean> {
  const deconnexion = (acces: string) =>
    reseau('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { authorization: `Bearer ${acces}` } })
  try {
    if (!jeton.valeur() && !(await jeton.renouveler())) return false
    let r = await deconnexion(jeton.valeur() ?? '')
    if (r.status === 401 && (await jeton.renouveler())) r = await deconnexion(jeton.valeur() ?? '')
    return r.ok
  }
  catch {
    return false
  }
  finally {
    jeton.definir(null)
  }
}
