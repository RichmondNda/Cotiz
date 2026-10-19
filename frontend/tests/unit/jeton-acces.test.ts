// Jeton d'accès en mémoire et renouvellement silencieux (lot 1.1, intégration front) : architecture/03.
import { describe, expect, it, vi } from 'vitest'
import { fonctionnalitesActives } from '../../app/utils/fonctionnalites'
import { creerJetonAcces, espaceDuJeton, fermerSession, fetchAvecRenouvellement } from '../../app/utils/jeton-acces'

const reponse = (status: number, body: unknown = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const jeton = (n: number) => ({ accessToken: `jwt-${n}`, expiresAt: '2026-10-16T10:15:00.000Z', space: 'platform' })

/** Verrou Web Locks simulé : exécutions l'une après l'autre. */
function verrous() {
  let file = Promise.resolve()
  return {
    request: <T>(_nom: string, fn: () => Promise<T>): Promise<T> => {
      const suite = file.then(fn)
      file = suite.then(() => undefined, () => undefined)
      return suite
    },
  }
}

describe('creerJetonAcces', () => {
  it('renouvelle par le cookie (POST /api/v1/auth/refresh) et garde le jeton en mémoire', async () => {
    const fetch = vi.fn().mockResolvedValue(reponse(200, jeton(1)))
    const store = creerJetonAcces({ fetch, locks: verrous() })
    expect(store.valeur()).toBeNull()
    expect(await store.renouveler()).toBe(true)
    expect(store.valeur()).toBe('jwt-1')
    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/refresh', expect.objectContaining({ method: 'POST', credentials: 'same-origin' }))
  })

  it('appels simultanés : un seul renouvellement (le cookie tourne à chaque appel)', async () => {
    let n = 0
    const fetch = vi.fn().mockImplementation(async () => reponse(200, jeton(++n)))
    const store = creerJetonAcces({ fetch, locks: verrous() })
    const resultats = await Promise.all([store.renouveler(), store.renouveler(), store.renouveler()])
    expect(resultats).toEqual([true, true, true])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('échec (session expirée ou révoquée) : jeton effacé, false', async () => {
    const store = creerJetonAcces({ fetch: vi.fn().mockResolvedValue(reponse(401, { code: 'session_revoked' })), locks: verrous() })
    store.definir('ancien')
    expect(await store.renouveler()).toBe(false)
    expect(store.valeur()).toBeNull()
  })

  it('sans Web Locks (navigateur ancien) : renouvellement quand même, un seul par onglet', async () => {
    const fetch = vi.fn().mockResolvedValue(reponse(200, jeton(1)))
    const store = creerJetonAcces({ fetch })
    await Promise.all([store.renouveler(), store.renouveler()])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('fetchAvecRenouvellement', () => {
  it('401 avec un jeton : renouvelle puis rejoue une fois avec le nouveau jeton', async () => {
    const store = creerJetonAcces({ fetch: vi.fn().mockResolvedValue(reponse(200, jeton(2))), locks: verrous() })
    store.definir('jwt-1')
    const appels: (string | null)[] = []
    const reseau = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const auth = new Headers(init.headers).get('authorization')
      appels.push(auth)
      return auth === 'Bearer jwt-2' ? reponse(200, { ok: true }) : reponse(401, { code: 'session_expired' })
    })
    const r = await fetchAvecRenouvellement(reseau, store)('/api/v1/me', { headers: { authorization: 'Bearer jwt-1' } })
    expect(r.status).toBe(200)
    expect(appels).toEqual(['Bearer jwt-1', 'Bearer jwt-2'])
  })

  it('sans jeton, sur un endpoint d’authentification, ou renouvellement refusé : la 401 est rendue telle quelle', async () => {
    const refus = creerJetonAcces({ fetch: vi.fn().mockResolvedValue(reponse(401)), locks: verrous() })
    refus.definir('jwt-1')
    const reseau = vi.fn().mockResolvedValue(reponse(401))
    expect((await fetchAvecRenouvellement(reseau, refus)('/api/v1/me', { headers: { authorization: 'Bearer jwt-1' } })).status).toBe(401)
    expect((await fetchAvecRenouvellement(reseau, refus)('/api/v1/me', {})).status).toBe(401)
    expect((await fetchAvecRenouvellement(reseau, refus)('/api/v1/auth/logout', { headers: { authorization: 'Bearer x' } })).status).toBe(401)
    expect(reseau).toHaveBeenCalledTimes(3)
  })
})

describe('fonctionnalitesActives (transition, option 1)', () => {
  it('livrée par /me, ou d’un lot dont aucun endpoint n’est encore basculé', () => {
    const actives = fonctionnalitesActives(['password_reset_manual'], new Set(['1.1']))
    expect(actives).toContain('password_reset_manual')
    expect(actives).toContain('payments') // lot 3.3 : encore simulé
    expect(actives).toContain('audit_log') // lot 4.7 : encore simulé
  })

  it('une fonctionnalité d’un lot basculé n’est active que si /me la livre', () => {
    expect(fonctionnalitesActives([], new Set(['1.1', '3.3']))).not.toContain('payments')
    expect(fonctionnalitesActives(['payments'], new Set(['1.1', '3.3']))).toContain('payments')
  })
})

describe('fermerSession (déconnexion)', () => {
  const logout = (accepte: string) => vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
    expect(url).toBe('/api/v1/auth/logout')
    return new Headers(init.headers).get('authorization') === `Bearer ${accepte}` ? reponse(204) : reponse(401)
  })

  it('jeton expiré : renouvelé puis déconnexion avec le nouveau (le cookie ne survit pas)', async () => {
    const store = creerJetonAcces({ fetch: vi.fn().mockResolvedValue(reponse(200, jeton(2))), locks: verrous() })
    store.definir('expire')
    const reseau = logout('jwt-2')
    expect(await fermerSession(reseau, store)).toBe(true)
    expect(reseau).toHaveBeenCalledTimes(2)
    expect(store.valeur()).toBeNull()
  })

  it('aucun jeton en mémoire (page rechargée) : renouvelé d’abord pour pouvoir fermer la connexion', async () => {
    const store = creerJetonAcces({ fetch: vi.fn().mockResolvedValue(reponse(200, jeton(3))), locks: verrous() })
    const reseau = logout('jwt-3')
    expect(await fermerSession(reseau, store)).toBe(true)
    expect(reseau).toHaveBeenCalledTimes(1)
  })

  it('plus de session (renouvellement refusé) : rien à fermer, false', async () => {
    const store = creerJetonAcces({ fetch: vi.fn().mockResolvedValue(reponse(401)), locks: verrous() })
    const reseau = vi.fn()
    expect(await fermerSession(reseau, store)).toBe(false)
    expect(reseau).not.toHaveBeenCalled()
  })
})

describe('espaceDuJeton', () => {
  const jwt = (payload: object) => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`

  it('claim `space` du jeton (affichage seulement : le back vérifie)', () => {
    expect(espaceDuJeton(jwt({ space: 'platform' }))).toBe('platform')
    expect(espaceDuJeton(jwt({ space: 'subscriber' }))).toBe('subscriber')
    expect(espaceDuJeton(jwt({}))).toBeNull()
    expect(espaceDuJeton('opaque')).toBeNull()
    expect(espaceDuJeton(null)).toBeNull()
  })
})
