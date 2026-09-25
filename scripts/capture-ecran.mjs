#!/usr/bin/env node
// Capture une route de l'app Nuxt en desktop (1440) et mobile (390), pour comparaison avec design/screens.
//
// Usage :
//   node scripts/capture-ecran.mjs <route> [--role gestionnaire|souscripteur|superadmin]
//                                          [--scenario <état>] [--nom <nom-fichier>] [--base http://localhost:3000]
// Exemples :
//   node scripts/capture-ecran.mjs /connexion
//   node scripts/capture-ecran.mjs /asso/paiements --role gestionnaire --scenario file-vide
//
// Sortie : .verif/<nom>__web.png et .verif/<nom>__mobile.png (pages entières).
// Prérequis : npm i -D playwright && npx playwright install chromium ; serveur `npm run dev` lancé.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const args = process.argv.slice(2)
const route = args.find((a) => a.startsWith('/'))
if (!route) {
  console.error('Route manquante. Ex. : node scripts/capture-ecran.mjs /asso --role gestionnaire')
  process.exit(1)
}
const opt = (k, d) => {
  const i = args.indexOf('--' + k)
  return i >= 0 ? args[i + 1] : d
}
const base = opt('base', 'http://localhost:3000')
const role = opt('role')
const scenario = opt('scenario')
const nom = opt('nom', (route.replace(/^\/|\/$/g, '').replace(/\//g, '_') || 'accueil') + (scenario ? '__' + scenario : ''))

const url = new URL(route, base)
if (scenario) url.searchParams.set('scenario', scenario)

mkdirSync('.verif', { recursive: true })
const browser = await chromium.launch()
for (const [dev, width, height] of [['web', 1440, 900], ['mobile', 390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: dev === 'mobile', hasTouch: dev === 'mobile' })
  if (role) await ctx.addCookies([{ name: 'cotiz_role', value: role, url: base }])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(url.toString(), { waitUntil: 'networkidle' })
  await page.waitForTimeout(600) // laisse passer la latence simulée des mocks
  const out = `.verif/${nom}__${dev}.png`
  await page.screenshot({ path: out, fullPage: true })
  console.log(`${out}  (${page.url()})`)
  if (errors.length) console.log(`  ⚠ erreurs ${dev} :\n  - ` + errors.join('\n  - '))
  await ctx.close()
}
await browser.close()
