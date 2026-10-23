// Pages légales : texte versionné en Markdown servi par le back (pub.legal), découpé en sections pour le sommaire.
import type { DocumentLegal } from '~/config/legal'
import { type PageLegale, vuePageLegale } from './vues/legal'

export const useDocumentLegal = (slug: MaybeRefOrGetter<DocumentLegal>) =>
  useLecture<PageLegale>(() => `legal:${toValue(slug)}`, async client =>
    vuePageLegale(await client.call('pub.legal', 'get', { params: { slug: toValue(slug) } })))
