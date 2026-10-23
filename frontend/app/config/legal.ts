// Pages légales (/legal/[document]) : onglets de la maquette (source-maquette/Legal.dc.html). Les textes, versionnés en
// Markdown, sont servis par le back (pub.legal, backend/content/legal/).

export type DocumentLegal = 'cgu' | 'confidentialite' | 'mentions'

/** Libellé de l'onglet de chaque document. */
export const ONGLETS_LEGAUX: Record<DocumentLegal, string> = {
  cgu: 'CGU',
  confidentialite: 'Confidentialité',
  mentions: 'Mentions légales',
}

export const estDocumentLegal = (v: unknown): v is DocumentLegal =>
  typeof v === 'string' && Object.hasOwn(ONGLETS_LEGAUX, v)
