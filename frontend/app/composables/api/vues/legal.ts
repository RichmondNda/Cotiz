// Pages légales : LegalPage du contrat → sections de l'interface (une par titre `##`, numérotées pour le sommaire).
import type { LegalPage } from '@cotiz/contracts'
import MarkdownIt from 'markdown-it'

export interface SectionLegale {
  id: string
  /** Titre numéroté du sommaire (« 1. Objet »). */
  titre: string
  html: string
}

export interface PageLegale {
  titre: string
  version: string
  /** Date de mise à jour `AAAA-MM-JJ`. */
  miseAJour: string
  sections: SectionLegale[]
}

// HTML brut désactivé (décision Q10) : le Markdown ne peut produire que du balisage échappé.
const md = new MarkdownIt({ html: false, linkify: false, typographer: false })

/** Markdown → sections : une par titre `##`, le texte avant le premier titre est ignoré. */
export function vuePageLegale(p: LegalPage): PageLegale {
  const tokens = md.parse(p.markdown, {})
  const sections: SectionLegale[] = []
  let debut = -1
  let titre = ''
  const fermer = (fin: number) => {
    if (debut < 0) return
    const i = sections.length
    sections.push({ id: `${p.slug}-${i}`, titre: `${i + 1}. ${titre}`, html: md.renderer.render(tokens.slice(debut, fin), md.options, {}) })
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t.type !== 'heading_open' || t.tag !== 'h2') continue
    fermer(i)
    titre = tokens[i + 1]?.content ?? ''
    // Corps : après `heading_open`, `inline` et `heading_close`.
    debut = i + 3
  }
  fermer(tokens.length)
  return { titre: p.title, version: p.version, miseAJour: p.updatedOn, sections }
}
