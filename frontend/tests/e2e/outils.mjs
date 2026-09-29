// Outils communs des parcours e2e (Playwright, sans runner de test).
// Chaque parcours part des données de référence (POST /api/_dev/reinitialiser) et d'une session vide,
// navigue uniquement par l'interface (clics, saisies) et vérifie les données affichées à chaque étape.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

export const BASE = process.env.COTIZ_BASE ?? 'http://localhost:3000'

export class EchecEtape extends Error {}

export async function assert(condition, message) {
  if (!condition) throw new EchecEtape(message)
}

/** Texte visible (espaces normalisés, espace fine insécable comprise) d'un localisateur. */
export async function texte(locator) {
  return (await locator.innerText()).replace(/[\s\u202F\u00A0]+/g, ' ').trim()
}

/** Attend (10 s max, le temps des squelettes) que la page affiche `attendu`. */
export async function contient(page, attendu, message) {
  for (let i = 0; i < 20; i++) {
    if ((await texte(page.locator('body'))).includes(attendu)) return
    await page.waitForTimeout(500)
  }
  throw new EchecEtape(`${message ?? 'Texte attendu absent'} : « ${attendu} »`)
}

/**
 * Lance un parcours : `etapes` est une liste [nom, fonction(page)].
 * Capture chaque étape dans .verif/e2e/<parcours>/, collecte les erreurs console, arrête au premier échec.
 */
export async function parcours(nom, { viewport = { width: 1440, height: 900 }, mobile = false } = {}, etapes) {
  mkdirSync(`.verif/e2e/${nom}`, { recursive: true })
  await fetch(new URL('/api/_dev/reinitialiser', BASE), { method: 'POST' }).catch(() => {})
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, baseURL: BASE })
  const page = await ctx.newPage()
  const erreurs = []
  page.on('pageerror', e => erreurs.push(e.message))
  page.on('console', m => m.type() === 'error' && erreurs.push(m.text()))
  page.on('response', r => r.status() >= 400 && r.url().includes('/api/') && erreurs.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`))
  let ok = true
  for (const [i, [etape, fn]] of etapes.entries()) {
    const n = String(i + 1).padStart(2, '0')
    try {
      await fn(page)
      await page.waitForTimeout(250)
      await page.screenshot({ path: `.verif/e2e/${nom}/${n}-${etape}.png`, fullPage: true })
      console.log(`  ✓ ${n} ${etape}  (${new URL(page.url()).pathname})`)
    }
    catch (e) {
      ok = false
      await page.screenshot({ path: `.verif/e2e/${nom}/${n}-${etape}__ECHEC.png`, fullPage: true }).catch(() => {})
      console.log(`  ✗ ${n} ${etape}  (${new URL(page.url()).pathname})\n    ${e.message.split('\n')[0]}`)
      break
    }
  }
  if (erreurs.length) {
    ok = false
    console.log('  ⚠ erreurs console / API :\n    - ' + [...new Set(erreurs)].join('\n    - '))
  }
  await browser.close()
  return ok
}
