// Pages légales (lot 1.3, décision Q10) : Markdown versionné → sections numérotées du sommaire, HTML brut échappé.
import { describe, expect, it } from 'vitest'
import { vuePageLegale } from '~/composables/api/vues/legal'

const page = (markdown: string) => vuePageLegale({ slug: 'cgu', title: 'Conditions générales d’utilisation', version: '0.1', updatedOn: '2026-10-23', markdown })

describe('vuePageLegale', () => {
  it('une section par titre `##`, numérotée, avec son propre corps', () => {
    const p = page('Préambule ignoré.\n\n## Objet\n\nPremier texte.\n\n## Accès au service\n\n- un\n- deux\n')
    expect(p.sections.map(s => [s.id, s.titre])).toEqual([['cgu-0', '1. Objet'], ['cgu-1', '2. Accès au service']])
    expect(p.sections[0]!.html).toBe('<p>Premier texte.</p>\n')
    expect(p.sections[1]!.html).toBe('<ul>\n<li>un</li>\n<li>deux</li>\n</ul>\n')
    expect(p).toMatchObject({ titre: 'Conditions générales d’utilisation', version: '0.1', miseAJour: '2026-10-23' })
  })

  it('un titre `###` reste dans la section courante', () => {
    const p = page('## Objet\n\n### Détail\n\nTexte.\n')
    expect(p.sections).toHaveLength(1)
    expect(p.sections[0]!.html).toContain('<h3>Détail</h3>')
  })

  it('HTML brut échappé, lien javascript: refusé', () => {
    const p = page('## Objet\n\n<script>alert(1)</script>\n\n[lien](javascript:alert(1))\n')
    expect(p.sections[0]!.html).not.toContain('<script>')
    expect(p.sections[0]!.html).toContain('&lt;script&gt;')
    expect(p.sections[0]!.html).not.toContain('href="javascript:')
  })
})
