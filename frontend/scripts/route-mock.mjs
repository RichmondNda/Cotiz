// Routes de l'inventaire (slugs : `/asso/projets/centre-communautaire`) → routes de l'app (UUID déterministes des mocks,
// server/mocks/ids.ts). Partagé par le script de capture et les tests e2e (parcours, cohérence, accessibilité).
import { uid } from '../server/mocks/ids.ts'

// Segment qui suit `projets/`, `souscripteurs/`… → UUID du type correspondant (sauf s'il en est déjà un, ou une sous-page).
const TYPES = { projets: 'project', souscripteurs: 'user', associations: 'association', paiements: 'payment', demandes: 'request', plans: 'plan' }
const SOUS_PAGES = new Set(['nouveau', 'nouvelle', 'declarer', 'import'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/

export function routeMock(route) {
  const [chemin, requete] = route.split('?')
  const segments = chemin.split('/').map((seg, i, tous) => {
    const type = TYPES[tous[i - 1]]
    return type && seg && !UUID.test(seg) && !SOUS_PAGES.has(seg) ? uid(type, seg) : seg
  })
  return segments.join('/') + (requete ? `?${requete}` : '')
}
