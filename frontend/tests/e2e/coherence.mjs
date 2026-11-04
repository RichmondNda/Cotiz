// Cohérence des données entre espaces (lot 09) : un même souscripteur, un même projet affichent les mêmes montants
// sur tous les écrans. Chaque ligne : [rôle, route, textes attendus]. Données de référence (store réinitialisé).
// Le vrai back n'est pas réinitialisé : lancer avant les parcours (tests/e2e/parcours.mjs valide le paiement d'Awa).
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
  // Fiches sur le vrai back (lot 2.3).
  ['gestionnaire', '/asso/souscripteurs/moussa-diarra', ['Moussa Diarra', 'Centre communautaire', 'Voyage solidaire']],
  // Projets sur le vrai back (lot 2.2) : statistiques de pr.get encore nulles (report du lot 2.3).
  ['gestionnaire', '/asso/projets/centre-communautaire', ['Centre communautaire']],
  ['gestionnaire', '/asso/souscripteurs/awa-kone', ['Awa Koné', 'Centre communautaire']],
  // Registre sur le vrai back (lot 2.4 : lg.grid, lg.pay.get) : paiements et soldes de seed-dev.
  ['gestionnaire', '/asso/projets/centre-communautaire/paiements', ['Moussa Diarra', F(325000), 'Awa Koné', F(300000)]],
  ['gestionnaire', '/asso/paiements/pm-awa-kone', ['Awa Koné', F(75000), `Reste à payer : ${F(300000)}`]],
  // Tableau de bord sur le vrai back (lot 2.6 : as.dashboard) : seed-dev au jour réel, dont les 47 souscripteurs de
  // démonstration ; les chiffres du 25 septembre (82 %, 14 retards, 1 240 000 F) sont vérifiés côté back
  // (reporting-seed-reference.test.ts). Ici, ce qui ne dépend pas du jour : 52 souscripteurs.
  ['gestionnaire', '/asso', ['Centre communautaire', 'sur 52 actifs']],
  ['gestionnaire', '/asso/projets', ['Centre communautaire', 'Tontine solidaire 2027', 'Voyage solidaire']],
  // Espace plateforme sur le vrai back (lot 1.4 : pf.dashboard, pf.asso.list, pf.asso.get) : ses chiffres viennent de
  // seed-dev, plus du store des mocks gestionnaire ; les comparer reprendra quand l'espace association sera réel. Les
  // compteurs plateforme sont testés côté back (platform-dashboard.test.ts, platform-associations.test.ts).
  ['superadmin', '/plateforme/associations/entraide-yopougon', ['Awa Koné']],
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
