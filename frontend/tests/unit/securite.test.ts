// En-têtes de sécurité du front (lot 3.5, étape 3 ; architecture/02 « En-têtes »).
import { describe, expect, it } from 'vitest'
import { avecNonce, ENTETES_SECURITE, origineDe, politiqueContenu } from '../../server/securite/entetes'

const NONCE = 'dGVzdC1ub25jZS0xMjM0NTY='
const directives = (csp: string) => Object.fromEntries(csp.split('; ').map((d) => {
  const [nom, ...valeurs] = d.split(' ')
  return [nom, valeurs]
}))

describe('politique de contenu', () => {
  it('scripts : même origine et nonce de la requête seulement, ni unsafe-inline ni eval', () => {
    const d = directives(politiqueContenu(NONCE))
    expect(d['script-src']).toEqual(['\'self\'', `'nonce-${NONCE}'`])
    expect(politiqueContenu(NONCE)).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/)
  })

  it('styles : balises de la même origine ou porteuses du nonce ; seuls les attributs `style` en ligne', () => {
    const d = directives(politiqueContenu(NONCE))
    expect(d['style-src']).toEqual(['\'self\'', `'nonce-${NONCE}'`])
    expect(d['style-src-attr']).toEqual(['\'unsafe-inline\''])
  })

  it('aucun encadrement, aucun objet, formulaires et base vers la même origine', () => {
    const d = directives(politiqueContenu(NONCE))
    expect(d['frame-ancestors']).toEqual(['\'none\''])
    expect(d['object-src']).toEqual(['\'none\''])
    expect(d['form-action']).toEqual(['\'self\''])
    expect(d['base-uri']).toEqual(['\'self\''])
  })

  it('connexions : même origine, stockage (URL signées) et GlitchTip, sans chemin ni secret du DSN', () => {
    const d = directives(politiqueContenu(NONCE, {
      stockage: 'https://fichiers.cotiz.app/cotiz-proofs',
      glitchtipDsn: 'https://cle-publique@erreurs.cotiz.app/3',
    }))
    expect(d['connect-src']).toEqual(['\'self\'', 'https://fichiers.cotiz.app', 'https://erreurs.cotiz.app'])
    expect(politiqueContenu(NONCE, { glitchtipDsn: 'https://cle-publique@erreurs.cotiz.app/3' })).not.toContain('cle-publique')
  })

  it('origines vides ou illisibles ignorées ; aucun hôte tiers par défaut', () => {
    expect(directives(politiqueContenu(NONCE, { stockage: '', glitchtipDsn: 'pas une url' }))['connect-src']).toEqual(['\'self\''])
    expect(origineDe(undefined)).toBeNull()
    expect(origineDe('http://localhost:9000/x?X-Amz-Expires=300')).toBe('http://localhost:9000')
  })

  it('nonce refusé s’il est court ou contient de quoi casser la directive', () => {
    expect(() => politiqueContenu('court')).toThrow()
    expect(() => politiqueContenu('aaaaaaaaaaaaaaaa\'; script-src *')).toThrow()
  })
})

describe('nonce des scripts de la page', () => {
  it('ajouté à chaque script et style, y compris module et JSON de Nuxt ; un nonce existant est gardé', () => {
    const html = '<script type="module" src="/_nuxt/entry.js" crossorigin></script><script>window.__NUXT__={}</script>'
      + '<script type="application/json" id="__NUXT_DATA__">[]</script><script nonce="deja">x()</script><style>a{}</style>'
    const out = avecNonce(html, NONCE)
    expect(out.match(/<script nonce="dGVzdC1ub25jZS0xMjM0NTY="/g)).toHaveLength(3)
    expect(out).toContain('<style nonce="dGVzdC1ub25jZS0xMjM0NTY=">')
    expect(out).toContain('<script nonce="deja">')
    expect(out).not.toContain('<script>')
  })

  it('en-têtes communs : pas d’encadrement, pas de détection de type, référent limité', () => {
    expect(ENTETES_SECURITE).toMatchObject({
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    })
  })
})
