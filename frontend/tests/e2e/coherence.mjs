// Cohérence des données entre espaces (lot 09) : un même souscripteur, un même projet affichent les mêmes montants
// sur tous les écrans. Chaque ligne : [rôle, route, textes attendus]. Données de référence (store réinitialisé).
//   node tests/e2e/coherence.mjs
import { chromium } from 'playwright'
import { BASE, texte } from './outils.mjs'
import { routeMock } from '../../scripts/route-mock.mjs'
import { ouvrirSession } from '../../scripts/session-test.mjs'

const F = n => `${n.toLocaleString('fr-FR').replace(/\s/g, ' ')} F`

// Moussa Diarra — Centre communautaire : 50 000 F d'entrée + 18 × 25 000 F = 500 000 F ; versé 175 000 F
// (entrée + mars → juillet) ; reste 325 000 F ; août et septembre en retard (50 000 F).
// Mutuelle santé : versé 50 000 F, reste 70 000 F → total versé 225 000 F, reste 395 000 F.
// Awa Koné — Centre communautaire : versé 200 000 F, reste 300 000 F, déclaration de 75 000 F en attente.
// Centre communautaire : 9 594 000 F collectés, 82 % de recouvrement, 14 souscripteurs en retard.
const ATTENDUS = [
  ['souscripteur', '/accueil', [F(395000), 'Centre communautaire', F(50000)]],
  ['souscripteur', '/projets/centre-communautaire', [F(325000), F(175000), F(500000), 'En retard']],
  ['souscripteur', '/historique', [F(225000), F(395000)]],
  ['souscripteur', '/paiements/declarer', [`${F(50000)} en retard`, `reste ${F(325000)}`, F(70000)]],
  ['null', '/', [F(395000), F(50000), F(9594000)]],
  ['gestionnaire', '/asso/souscripteurs/moussa-diarra', [F(175000), F(325000), 'En retard · 2']],
  ['gestionnaire', '/asso/projets/centre-communautaire', ['Moussa Diarra', F(50000), F(9594000), '82 %', '14']],
  ['gestionnaire', '/asso/souscripteurs/awa-kone', [F(200000), F(300000)]],
  ['gestionnaire', '/asso/paiements/pm-awa-kone', ['Awa Koné', F(75000)]],
  ['gestionnaire', '/asso', [F(9594000), '82 %', '14', F(75000)]],
  ['gestionnaire', '/asso/projets', [F(9594000)]],
  ['superadmin', '/plateforme/associations/entraide-yopougon', ['Awa Koné', '82 %', '52']],
  // Plateforme : 132 à jour + 15 impayées = 147 actives ; + 1 en onboarding = 148 associations.
  ['superadmin', '/plateforme', ['147', 'sur 147 associations', '132 abonnements à jour']],
  ['superadmin', '/plateforme/associations', ['Toutes · 148', 'Actives · 132', 'Impayées · 15', 'Onboarding · 1', '148 au total']],
  // Limites du plan Pro de seed-reference.yaml (projets illimités, 500 souscripteurs) : écart R1 de docs/specs/v0-mapping.md.
  ['superadmin', '/plateforme/associations/ressortissants-man', ['5', 'Projets 5 / illimité', 'Souscripteurs 142 / 500']],
]

const browser = await chromium.launch()
await fetch(new URL('/api/_dev/reinitialiser', BASE), { method: 'POST' })
let ok = true
for (const [role, route, attendus] of ATTENDUS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ouvrirSession(ctx, role, BASE)
  const page = await ctx.newPage()
  await page.goto(new URL(routeMock(route), BASE).toString(), { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const corps = await texte(page.locator('body'))
  const manquants = attendus.filter(a => !corps.includes(a.replace(/\s/g, ' ')))
  if (manquants.length) ok = false
  console.log(`${manquants.length ? '✗' : '✓'} ${route} (${role})${manquants.length ? ' — absents : ' + manquants.map(m => `« ${m} »`).join(', ') : ''}`)
  await ctx.close()
}
await browser.close()
process.exit(ok ? 0 : 1)
