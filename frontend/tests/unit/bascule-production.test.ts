// Build sans handlers simulés (NUXT_MOCKS=0, lot 3.5) : seuls les endpoints du registre de bascule sont appelés.
// `__COTIZ_MOCKS__` est posé par nuxt.config.ts (`vite.define`) ; ici, simulé par une globale avant l'import.
import { afterEach, describe, expect, it, vi } from 'vitest'

async function bascule(mocks: boolean | undefined) {
  vi.resetModules()
  if (mocks !== undefined) vi.stubGlobal('__COTIZ_MOCKS__', mocks)
  return import('~/utils/bascule')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// Import à froid du module après resetModules : plus de 5 s quand pnpm verify charge la machine.
describe('endpointDisponible', { timeout: 20_000 }, () => {
  it('build avec mocks : tout endpoint est appelable, livré ou non', async () => {
    const b = await bascule(true)
    expect(b.AVEC_MOCKS).toBe(true)
    expect(b.endpointDisponible('bl.inv', 'association')).toBe(true)
  })

  it('constante absente (hors build Nuxt) : traité comme un build avec mocks', async () => {
    const b = await bascule(undefined)
    expect(b.AVEC_MOCKS).toBe(true)
  })

  it('build sans mocks : seulement les endpoints basculés pour l’espace', async () => {
    const b = await bascule(false)
    expect(b.AVEC_MOCKS).toBe(false)
    // bl.inv (lot 4.6) n'est pas livré ; me.project (lot 3.2) l'est pour l'espace souscripteur.
    expect(b.endpointDisponible('bl.inv', 'association')).toBe(false)
    expect(b.endpointDisponible('me.project', 'subscriber')).toBe(true)
  })
})
