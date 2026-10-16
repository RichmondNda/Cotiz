// Audit axe-core (WCAG 2.0/2.1 A et AA) de toutes les routes de la V0, en 1440 px et 390 px.
//   node tests/e2e/accessibilite.mjs              → toutes les routes
//   node tests/e2e/accessibilite.mjs /asso /accueil
// Les contrastes des paires connues de la charte (design-system/README.md, « Accessibilité ») sont listés à part :
// ils relèvent d'un arbitrage de charte, pas d'un correctif d'écran.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { BASE } from './outils.mjs'
import { routeMock } from '../../scripts/route-mock.mjs'
import { ouvrirSession } from '../../scripts/session-test.mjs'

const axe = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

const ROUTES = {
  null: ['/', '/demande', '/demande/confirmation', '/connexion', '/connexion/association', '/connexion/plateforme', '/mot-de-passe', '/legal/cgu'],
  souscripteur: ['/accueil', '/projets/centre-communautaire', '/projets/voyage-solidaire/contrat', '/paiements/declarer', '/historique', '/associations', '/associations/entraide-yopougon', '/contrats', '/notifications', '/profil', '/bienvenue'],
  gestionnaire: ['/asso', '/asso/projets', '/asso/projets/nouveau', '/asso/projets/centre-communautaire', '/asso/projets/centre-communautaire/souscripteurs', '/asso/projets/centre-communautaire/paiements', '/asso/projets/centre-communautaire/contrat', '/asso/projets/centre-communautaire/parametres', '/asso/projets/centre-communautaire/rapports', '/asso/projets/centre-communautaire/import', '/asso/souscripteurs', '/asso/souscripteurs/moussa-diarra', '/asso/paiements', '/asso/paiements/pm-awa-kone', '/asso/relances', '/asso/contrats', '/asso/equipe', '/asso/abonnement', '/asso/parametres', '/asso/notifications', '/asso/profil', '/asso/plus', '/asso/bienvenue'],
  superadmin: ['/plateforme', '/plateforme/demandes', '/plateforme/demandes/tontine-commercantes-adjame', '/plateforme/associations', '/plateforme/associations/entraide-yopougon', '/plateforme/associations/nouvelle', '/plateforme/plans', '/plateforme/plans/essentiel', '/plateforme/plans/nouveau', '/plateforme/facturation', '/plateforme/utilisateurs', '/plateforme/profil'],
}

const filtre = process.argv.slice(2)
// Rendus audités en parallèle (pages indépendantes) : l'audit séquentiel dépassait 6 min en CI.
const PARALLELE = Number(process.env.A11Y_PARALLELE ?? 4)
const browser = await chromium.launch()
const violations = new Map() // règle → { impact, aide, occurrences: Set<route (vue) : cible> }
let pages = 0

const rendus = Object.entries(ROUTES).flatMap(([role, routes]) => routes
  .filter(route => !filtre.length || filtre.includes(route))
  .flatMap(route => [['web', 1440, 900], ['mobile', 390, 844]].map(([vue, width, height]) => ({ role, route, vue, width, height }))))

/**
 * Navigation avec un seul nouvel essai sur délai dépassé (serveur de dev qui compile les pages à la première visite,
 * runner de CI chargé) ; le nouvel essai est signalé pour qu'un vrai blocage reste visible.
 */
async function naviguer(page, route, vue) {
  const url = new URL(routeMock(route), BASE).toString()
  try {
    return await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  }
  catch (e) {
    if (e.name !== 'TimeoutError') throw e
    console.log(`… ${route} (${vue}) : délai dépassé, nouvel essai`)
    return page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  }
}

async function auditer({ role, route, vue, width, height }) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: vue === 'mobile', hasTouch: vue === 'mobile' })
  await ouvrirSession(ctx, role, BASE)
  const page = await ctx.newPage()
  const reponse = await naviguer(page, route, vue)
  await page.waitForTimeout(700)
  // Une route mal traduite (slug au lieu d'UUID) auditerait la page « introuvable » sans rien signaler : échec.
  if (!reponse || reponse.status() >= 400 || /introuvable/i.test(await page.locator('main, body').first().innerText())) {
    const e = violations.get('page-introuvable') ?? { impact: 'critical', aide: 'La route doit afficher son écran, pas une page d’erreur', occurrences: new Set() }
    e.occurrences.add(`${route} (${vue}) : HTTP ${reponse?.status() ?? '?'}`)
    violations.set('page-introuvable', e)
  }
  await page.addScriptTag({ content: axe })
  const res = await page.evaluate(() => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  }))
  pages++
  for (const v of res.violations) {
    const e = violations.get(v.id) ?? { impact: v.impact, aide: v.help, occurrences: new Set() }
    // Outils de dev Nuxt (bouton flottant) : hors application.
    for (const n of v.nodes.filter(n => !n.target.join(' ').includes('nuxt-devtools'))) e.occurrences.add(`${route} (${vue}) : ${n.target.join(' ')}${v.id === 'color-contrast' ? ' — ' + (n.any[0]?.message.match(/contrast of ([\d.]+)/)?.[1] ?? '?') + ':1' : ''}`)
    if (e.occurrences.size) violations.set(v.id, e)
  }
  await ctx.close()
}

let suivant = 0
await Promise.all(Array.from({ length: PARALLELE }, async () => {
  while (suivant < rendus.length) await auditer(rendus[suivant++])
}))
await browser.close()

console.log(`${pages} rendus audités.`)
if (!violations.size) console.log('Aucune violation.')
for (const [id, v] of violations) {
  console.log(`\n■ ${id} [${v.impact}] ${v.aide} — ${v.occurrences.size} occurrence(s)`)
  for (const o of [...v.occurrences].sort().slice(0, 12)) console.log(`   - ${o}`)
  if (v.occurrences.size > 12) console.log(`   … ${v.occurrences.size - 12} de plus`)
}
process.exit([...violations.keys()].some(k => k !== 'color-contrast') ? 1 : 0)
