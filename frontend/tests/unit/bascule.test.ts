// Registre et proxy de bascule (lot 0.3, étape 4) : un id ajouté au registre n'est plus servi par le mock.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ENDPOINTS } from '@cotiz/contracts'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { bascule, decide, spaceOfToken } from '../../server/bascule/proxy'
import { REAL_ENDPOINTS } from '../../server/bascule/real-endpoints'
import { resolveEndpoint } from '../../server/bascule/resolve'

const UUID = '0192f3a0-0000-7000-8000-000000000001'

describe('resolveEndpoint', () => {
  it('retrouve l’id et l’opération de chaque chemin du registre', () => {
    for (const [id, def] of Object.entries(ENDPOINTS)) {
      for (const [op, o] of Object.entries(def.operations)) {
        const path = o.path.replace(/\{(\w+)\}/g, (_m, p: string) => (p === 'slug' ? 'cgu' : p === 'provider' ? 'cinetpay' : UUID))
        expect(resolveEndpoint(o.method, `${path}?limit=10`), `${o.method} ${o.path}`).toEqual({ id, op })
      }
    }
  })

  it('un segment fixe l’emporte sur un paramètre', () => {
    expect(resolveEndpoint('POST', `/api/v1/associations/${UUID}/projects/schedule-preview`)).toEqual({ id: 'pr.preview', op: 'preview' })
    expect(resolveEndpoint('GET', '/api/v1/me/notifications/unread-count')).toEqual({ id: 'nt.list', op: 'unreadCount' })
  })

  it('chemin ou méthode inconnus → null', () => {
    expect(resolveEndpoint('GET', '/api/v1/inconnu')).toBeNull()
    expect(resolveEndpoint('DELETE', '/api/v1/me/dashboard')).toBeNull()
  })
})

describe('decide', () => {
  const base = { mocks: true, apiOrigin: 'http://api' }

  it('mock par défaut, NestJS pour un id du registre', () => {
    expect(decide('GET', '/api/v1/me/dashboard', base)).toBe('mock')
    expect(decide('GET', '/api/v1/me/dashboard', { ...base, real: new Set(['me.dash']) })).toBe('proxy')
    expect(decide('GET', '/api/v1/health/live', base)).toBe('proxy')
  })

  it('NUXT_MOCKS=0 : tout part vers NestJS', () => {
    expect(decide('GET', '/api/v1/me/dashboard', { ...base, mocks: false })).toBe('proxy')
  })

  it('le registre contient sys.health (bascule du lot 0.1)', () => {
    expect(REAL_ENDPOINTS.get('sys.health')).toBe('all')
  })

  it('lot 1.2 : authentification et /me pour tous les espaces ; fichiers pour la plateforme seulement ; plans', () => {
    for (const id of ['auth.login', 'auth.refresh', 'auth.logout', 'auth.activate', 'auth.forgot', 'auth.verify', 'auth.reset', 'me'] as const) {
      expect(REAL_ENDPOINTS.get(id), id).toBe('all')
    }
    for (const id of ['fl.upload', 'fl.get'] as const) expect(REAL_ENDPOINTS.get(id), id).toEqual(['platform'])
    for (const id of ['pub.plans', 'pf.plans', 'pf.plan.write', 'pf.plan.archive'] as const) expect(REAL_ENDPOINTS.get(id), id).toBe('all')
    // Second facteur du super-admin : simulé jusqu'au lot 4.7.
    expect(REAL_ENDPOINTS.has('auth.mfa')).toBe(false)
  })

  describe('bascule par espace', () => {
    const real = new Map([['auth.login', ['platform']], ['me', ['platform']], ['auth.refresh', ['platform']]] as const)
    const config = { ...base, real }

    it('espace de la requête basculé : NestJS ; autre espace ou inconnu : mock', () => {
      expect(decide('POST', '/api/v1/auth/login', config, { space: 'platform' })).toBe('proxy')
      expect(decide('POST', '/api/v1/auth/login', config, { space: 'subscriber' })).toBe('mock')
      expect(decide('POST', '/api/v1/auth/login', config, {})).toBe('mock')
      expect(decide('GET', '/api/v1/me', config, { space: 'platform' })).toBe('proxy')
      expect(decide('GET', '/api/v1/me', config, { space: 'association' })).toBe('mock')
    })

    it('cookie de renouvellement (posé par NestJS seulement) : auth.refresh part vers NestJS', () => {
      expect(decide('POST', '/api/v1/auth/refresh', config, { refreshCookie: true })).toBe('proxy')
      expect(decide('POST', '/api/v1/auth/refresh', config, {})).toBe('mock')
    })

    it('un registre en Set vaut « tous les espaces »', () => {
      expect(decide('GET', '/api/v1/public/plans', { ...base, real: new Set(['pub.plans']) }, {})).toBe('proxy')
    })
  })
})

describe('requestSpace', () => {
  const jwt = (payload: object) => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`

  it('claim `space` du jeton Bearer (lecture seule : NestJS vérifie la signature)', () => {
    expect(spaceOfToken(jwt({ space: 'platform', sub: 'x' }))).toBe('platform')
    expect(spaceOfToken(jwt({ sub: 'x' }))).toBeUndefined()
    expect(spaceOfToken('jeton-opaque-du-mock')).toBeUndefined()
    expect(spaceOfToken(jwt({ space: 'system' }))).toBeUndefined()
  })
})

describe('proxy de bascule (serveurs HTTP réels)', () => {
  const servers: ReturnType<typeof createServer>[] = []
  let nest = ''
  const real = new Set<string>()
  const realBySpace = new Map<string, readonly string[]>()
  let front = ''

  beforeAll(async () => {
    const listen = async (s: ReturnType<typeof createServer>) => {
      servers.push(s)
      await new Promise<void>(r => s.listen(0, '127.0.0.1', r))
      return `http://127.0.0.1:${(s.address() as AddressInfo).port}`
    }
    nest = await listen(createServer((req, res) => {
      let raw = ''
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()))
      req.on('end', () => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ from: 'nest', url: req.url, ...(raw ? { body: JSON.parse(raw) as unknown } : {}) }))
      })
    }))
    const mock = defineEventHandler(() => ({ from: 'mock' }))
    const app = createApp()
    app.use(defineEventHandler(event => bascule(event, { mocks: true, apiOrigin: nest, real: real.size > 0 ? real : realBySpace })))
    app.use(createRouter()
      .get('/api/v1/public/plans', mock)
      .post('/api/v1/auth/login', mock)
      .post('/api/v1/auth/logout', mock)
      .post('/api/v1/auth/refresh', mock)
      .post('/api/v1/auth/password/reset', mock))
    front = await listen(createServer(toNodeListener(app)))
  })

  afterAll(() => servers.forEach(s => s.close()))

  it('sans l’id au registre : le mock répond', async () => {
    real.clear()
    expect(await (await fetch(`${front}/api/v1/public/plans`)).json()).toEqual({ from: 'mock' })
  })

  it('le mock renvoie un X-Request-Id comme NestJS : repris s’il est valide, sinon généré', async () => {
    real.clear()
    const repris = await fetch(`${front}/api/v1/public/plans`, { headers: { 'x-request-id': 'req-front-1' } })
    expect(repris.headers.get('x-request-id')).toBe('req-front-1')
    const genere = await fetch(`${front}/api/v1/public/plans`, { headers: { 'x-request-id': 'pas valide !' } })
    expect(genere.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('avec l’id au registre : la requête est transmise à NestJS (chemin et paramètres conservés)', async () => {
    real.add('pub.plans')
    expect(await (await fetch(`${front}/api/v1/public/plans?x=1`)).json()).toEqual({ from: 'nest', url: '/api/v1/public/plans?x=1' })
  })

  describe('par espace (registre en Map)', () => {
    beforeEach(() => real.clear())
    const jwt = (payload: object) => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(`${front}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

    it('corps : `space` plateforme → NestJS (corps transmis intact), autre espace → mock', async () => {
      realBySpace.set('auth.login', ['platform'])
      const nestReply = await (await post('/api/v1/auth/login', { space: 'platform', identifier: 'a@b.c', password: 'x' })).json()
      expect(nestReply).toEqual({ from: 'nest', url: '/api/v1/auth/login', body: { space: 'platform', identifier: 'a@b.c', password: 'x' } })
      expect(await (await post('/api/v1/auth/login', { space: 'subscriber', identifier: '+225', password: 'x' })).json()).toEqual({ from: 'mock' })
    })

    it('jeton de réinitialisation dans le corps : son claim `space`', async () => {
      realBySpace.set('auth.reset', ['platform'])
      expect((await (await post('/api/v1/auth/password/reset', { resetToken: jwt({ space: 'platform' }), newPassword: 'x' })).json()).from).toBe('nest')
      expect(await (await post('/api/v1/auth/password/reset', { resetToken: 'opaque', newPassword: 'x' })).json()).toEqual({ from: 'mock' })
    })

    it('connexion d’un autre espace avec une session plateforme ouverte : le corps l’emporte sur le Bearer', async () => {
      realBySpace.set('auth.login', ['platform'])
      const bearer = { authorization: `Bearer ${jwt({ space: 'platform' })}` }
      expect(await (await post('/api/v1/auth/login', { space: 'association', identifier: 'a@b.c', password: 'x' }, bearer)).json()).toEqual({ from: 'mock' })
      const autre = { authorization: `Bearer ${jwt({ space: 'association' })}` }
      expect((await (await post('/api/v1/auth/login', { space: 'platform', identifier: 'a@b.c', password: 'x' }, autre)).json()).from).toBe('nest')
    })

    it('Bearer : claim `space` ; cookie de renouvellement : auth.refresh', async () => {
      realBySpace.set('auth.refresh', ['platform'])
      realBySpace.set('auth.logout', ['platform'])
      expect((await (await post('/api/v1/auth/logout', {}, { authorization: `Bearer ${jwt({ space: 'platform' })}` })).json()).from).toBe('nest')
      expect(await (await post('/api/v1/auth/logout', {}, { authorization: `Bearer ${jwt({ space: 'subscriber' })}` })).json()).toEqual({ from: 'mock' })
      expect((await (await post('/api/v1/auth/refresh', {}, { cookie: 'cotiz_refresh=abc' })).json()).from).toBe('nest')
      expect(await (await post('/api/v1/auth/refresh', {})).json()).toEqual({ from: 'mock' })
    })
  })
})
