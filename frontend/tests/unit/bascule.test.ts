// Registre et proxy de bascule (lot 0.3, étape 4) : un id ajouté au registre n'est plus servi par le mock.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ENDPOINTS } from '@cotiz/contracts'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bascule, decide } from '../../server/bascule/proxy'
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
    expect(decide('GET', '/api/v1/public/plans', base)).toBe('mock')
    expect(decide('GET', '/api/v1/public/plans', { ...base, real: new Set(['pub.plans']) })).toBe('proxy')
    expect(decide('GET', '/api/v1/health/live', base)).toBe('proxy')
  })

  it('NUXT_MOCKS=0 : tout part vers NestJS', () => {
    expect(decide('GET', '/api/v1/public/plans', { ...base, mocks: false })).toBe('proxy')
  })

  it('le registre contient sys.health (bascule du lot 0.1)', () => {
    expect(REAL_ENDPOINTS.has('sys.health')).toBe(true)
  })
})

describe('proxy de bascule (serveurs HTTP réels)', () => {
  const servers: ReturnType<typeof createServer>[] = []
  let nest = ''
  const real = new Set<string>()
  let front = ''

  beforeAll(async () => {
    const listen = async (s: ReturnType<typeof createServer>) => {
      servers.push(s)
      await new Promise<void>(r => s.listen(0, '127.0.0.1', r))
      return `http://127.0.0.1:${(s.address() as AddressInfo).port}`
    }
    nest = await listen(createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ from: 'nest', url: req.url }))
    }))
    const app = createApp()
    app.use(defineEventHandler(event => bascule(event, { mocks: true, apiOrigin: nest, real })))
    app.use(createRouter().get('/api/v1/public/plans', defineEventHandler(() => ({ from: 'mock' }))))
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
})
