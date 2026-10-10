// Rapports d'erreurs du front vers GlitchTip (lot 0.6, étape 3) : inactif sans DSN, requestId joint, données
// personnelles filtrées.
import { ApiError } from '@cotiz/api-client'
import { describe, expect, it, vi } from 'vitest'
import { AUCUNE_COLLECTE, demarrerGlitchtip, nettoyerEvenement, requestIdDe } from '../../app/utils/glitchtip'

describe('requestIdDe', () => {
  it('lit le requestId d’une ApiError, d’une erreur Nuxt (data = Problem) ou de sa cause', () => {
    expect(requestIdDe(new ApiError(500, { type: 't', title: 'x', status: 500, code: 'internal_error', requestId: 'r1' }))).toBe('r1')
    expect(requestIdDe({ statusCode: 500, data: { code: 'internal_error', requestId: 'r2' } })).toBe('r2')
    expect(requestIdDe(new Error('x', { cause: new ApiError(502, null, 'r3') }))).toBe('r3')
    expect(requestIdDe(new Error('x'))).toBeUndefined()
  })
})

describe('nettoyerEvenement', () => {
  it('retire les props du composant et les données libres, garde son nom', () => {
    const evenement = nettoyerEvenement({
      contexts: { vue: { componentName: 'HandoffCard', propsData: { code: '482913', telephone: '+2250707070707' }, lifecycleHook: 'render' } },
      extra: { saisie: '482913' },
    })
    expect(evenement.contexts).toEqual({ vue: { componentName: 'HandoffCard' } })
    expect(evenement.extra).toBeUndefined()
    expect(JSON.stringify(evenement)).not.toContain('482913')
  })

  it('retire requête, utilisateur et fil d’Ariane ; masque les téléphones ; joint le requestId', () => {
    const evenement = nettoyerEvenement(
      {
        message: 'échec pour +225 07 07 07 07 07',
        request: { url: 'https://cotiz.app/activation?code=482913', headers: { cookie: 'sid=1' } },
        user: { id: 'u1', ip_address: '10.0.0.7' },
        breadcrumbs: [{ message: 'clic' }],
        exception: { values: [{ type: 'Error', value: 'numéro 0707070707 inconnu' }] },
      },
      { originalException: new ApiError(500, null, 'req-9') },
    )
    expect(evenement.request).toEqual({ url: 'https://cotiz.app/activation' })
    expect(evenement.user).toBeUndefined()
    expect(evenement.breadcrumbs).toBeUndefined()
    expect(JSON.stringify(evenement)).not.toMatch(/0707070707|07 07 07 07 07|482913|10\.0\.0\.7/)
    expect(evenement.tags).toMatchObject({ requestId: 'req-9' })
  })
})

describe('demarrerGlitchtip', () => {
  it('sans DSN : le SDK n’est jamais chargé', async () => {
    const charger = vi.fn()
    expect(await demarrerGlitchtip({ dsn: '', version: 'dev', charger, app: {} })).toBe(false)
    expect(charger).not.toHaveBeenCalled()
  })

  it('avec DSN : SDK chargé à la demande, version, aucune collecte, intégrations d’erreurs seulement, props jamais jointes', async () => {
    const init = vi.fn()
    const vueIntegration = vi.fn(() => 'vue')
    const globalHandlersIntegration = vi.fn(() => 'globales')
    expect(await demarrerGlitchtip({
      dsn: 'https://cle@glitchtip.local/1',
      version: '1.2.3',
      charger: () => Promise.resolve({ init, vueIntegration, globalHandlersIntegration }),
      app: {},
    })).toBe(true)
    expect(vueIntegration).toHaveBeenCalledWith({ attachProps: false })
    expect(init).toHaveBeenCalledWith(expect.objectContaining({
      dsn: 'https://cle@glitchtip.local/1',
      release: '1.2.3',
      dataCollection: AUCUNE_COLLECTE,
      defaultIntegrations: false,
      integrations: ['vue', 'globales'],
    }))
    expect(AUCUNE_COLLECTE).toMatchObject({ userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false })
    // Le beforeSend branché est bien le nettoyage (props retirées, requestId joint).
    const { beforeSend } = init.mock.calls[0]![0] as { beforeSend: (e: object, h: object) => Record<string, unknown> }
    const envoye = beforeSend(
      { contexts: { vue: { componentName: 'GrilleEcheances', propsData: { montant: 25000 } } } },
      { originalException: new ApiError(500, null, 'req-7') },
    )
    expect(envoye).toEqual({ contexts: { vue: { componentName: 'GrilleEcheances' } }, tags: { requestId: 'req-7' } })
  })
})
