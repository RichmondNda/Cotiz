// Parcours de fumée de la V0 (lots 09 et 0.3), rejoués sur le serveur de dev (mocks Nitro conformes au contrat).
//   node tests/e2e/parcours.mjs            → les 4 parcours
//   node tests/e2e/parcours.mjs plateforme → un seul (public | souscripteur | gestionnaire | plateforme)
// Captures de chaque étape : .verif/e2e/<parcours>/. Code de sortie 1 si une étape échoue.
import { ID, uid } from '../../server/mocks/ids.ts'
import { assert, contient, parcours, texte } from './outils.mjs'

// Les routes portent les UUID déterministes du jeu simulé (server/mocks/ids.ts), plus des slugs.
const PAIEMENT_AWA = uid('payment', 'pm-awa-kone')
const DEMANDE_TONTINE = uid('request', 'tontine-commercantes-adjame')

let compteurAvant = 0

/** Compteur (badge) d'une entrée de la navigation latérale ; 0 s'il n'y en a pas. */
async function compteurMenu(page, entree) {
  const lien = page.getByRole('navigation').getByRole('link', { name: new RegExp(`^${entree}`) }).first()
  const n = (await texte(lien)).match(/\d+/)
  return n ? Number(n[0]) : 0
}

/** Attend (10 s max) que le compteur du menu satisfasse `condition` ; renvoie la dernière valeur lue. */
async function attendreCompteur(page, entree, condition) {
  let n = 0
  for (let i = 0; i < 20; i++) {
    n = await compteurMenu(page, entree)
    if (condition(n)) return n
    await page.waitForTimeout(500)
  }
  return n
}

const PARCOURS = {
  // Public → demande de création → confirmation.
  public: () => parcours('public', {}, [
    ['landing', async (page) => {
      await page.goto('/', { waitUntil: 'networkidle' })
      await page.getByRole('main').getByRole('link', { name: 'Créer mon association' }).first().click()
      await page.waitForURL('**/demande')
    }],
    ['etape-1', async (page) => {
      await page.getByLabel('Nom de l’association').fill('Amicale des tisserands de Korhogo')
      await page.getByLabel('Ville').fill('Korhogo')
      await page.getByLabel('Description de l’activité').fill('Cotisations pour l’achat de métiers à tisser partagés.')
      await page.getByRole('button', { name: 'Continuer' }).click()
    }],
    ['etape-2', async (page) => {
      await page.getByLabel('Prénom').fill('Adama')
      await page.getByLabel(/^Nom\s*\*?$/).fill('Silué')
      await page.getByLabel('Fonction dans l’association').fill('Président')
      await page.getByLabel('Email').fill('adama@tisserands.ci')
      await page.getByLabel('Téléphone').fill('0701020304')
      await page.getByRole('button', { name: 'Continuer' }).click()
    }],
    ['etape-3', async (page) => {
      await page.getByRole('combobox', { name: 'Nombre estimé de souscripteurs' }).click()
      await page.getByRole('option', { name: 'Moins de 50', exact: true }).click()
      await page.getByRole('combobox', { name: 'Comment avez-vous connu Cotiz ?' }).click()
      await page.getByRole('option', { name: 'Bouche-à-oreille', exact: true }).click()
      await page.getByRole('radio', { name: /Découverte/ }).click()
      await page.getByRole('checkbox', { name: /conditions générales/ }).check({ force: true })
      await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
      await page.waitForURL('**/demande/confirmation')
    }],
    ['confirmation', async (page) => {
      await page.getByRole('heading', { name: 'Demande envoyée !' }).waitFor()
      await contient(page, 'adama@tisserands.ci', 'Email de réponse')
      await page.getByRole('link', { name: 'Retour à l’accueil' }).click()
      await page.waitForURL(u => new URL(u).pathname === '/')
    }],
  ]),

  // Connexion souscripteur → accueil → projet en retard → déclarer un paiement → confirmation → historique.
  souscripteur: () => parcours('souscripteur', {}, [
    ['connexion', async (page) => {
      await page.goto('/connexion', { waitUntil: 'networkidle' })
      await page.getByLabel('Téléphone').fill('0544218790')
      await page.getByLabel('Mot de passe', { exact: true }).fill('motdepasse')
      await page.getByRole('button', { name: 'Me connecter' }).click()
      await page.waitForURL('**/accueil')
    }],
    ['accueil', async (page) => {
      await page.getByRole('link', { name: /Centre communautaire/ }).first().click()
      await page.waitForURL(`**/projets/${ID.centre}`)
    }],
    ['projet-en-retard', async (page) => {
      await contient(page, '325 000 F', 'Reste à payer du projet')
      await contient(page, 'En retard', 'Statut de retard du projet')
      await page.getByRole('main').getByRole('link', { name: 'Déclarer un paiement' }).click()
      await page.waitForURL(`**/paiements/declarer?projet=${ID.centre}`)
    }],
    ['declarer-montant', async (page) => {
      const projet = page.getByRole('radio', { name: /Centre communautaire/ })
      if (await projet.isVisible().catch(() => false)) {
        await projet.click()
        await page.getByRole('button', { name: 'Continuer' }).click()
      }
      await page.getByRole('button', { name: /3 mois/ }).click()
      // 75 000 F répartis par le domaine sur les 3 plus anciennes échéances ouvertes : août et septembre (en retard), octobre.
      await contient(page, '75 000', 'Montant du raccourci « 3 mois »')
      await contient(page, 'Total affecté 75 000 F', 'Répartition proposée : total affecté')
      const cochees = await page.getByRole('checkbox', { checked: true }).evaluateAll(els => els.map(e => e.closest('label, li, div')?.innerText.split('\n')[0].trim()))
      await assert(cochees.length === 3 && ['Août 2026', 'Septembre 2026', 'Octobre 2026'].every(m => cochees.some(c => c?.includes(m))),
        `Échéances couvertes : ${JSON.stringify(cochees)} (attendu : août, septembre, octobre 2026)`)
      await page.getByRole('button', { name: 'Continuer' }).click()
    }],
    ['declarer-preuve', async (page) => {
      await page.getByLabel('Référence de la transaction').fill('MP260928.0915.E2E')
      await page.locator('input[type="file"]:not([capture])').setInputFiles({ name: 'preuve.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(200 * 1024) })
      await page.getByRole('button', { name: 'Continuer' }).click()
    }],
    ['confirmation', async (page) => {
      await contient(page, '75 000 F', 'Récapitulatif : montant déclaré')
      await page.getByRole('button', { name: 'Envoyer ma déclaration' }).click()
      await page.getByRole('heading', { name: 'Déclaration envoyée !' }).waitFor()
    }],
    ['historique', async (page) => {
      await page.getByRole('link', { name: /historique/i }).first().click()
      await page.waitForURL('**/historique')
      await contient(page, 'Centre communautaire 25/09/2026 · août, sept., oct. 75 000 F En attente', 'La déclaration envoyée apparaît dans l’historique, en attente')
      await contient(page, 'Total versé 225 000 F', 'Total versé inchangé tant que la déclaration n’est pas validée')
    }],
  ]),

  // Connexion gestionnaire → tableau de bord → paiements à valider → détail → valider → grille du projet.
  gestionnaire: () => parcours('gestionnaire', {}, [
    ['connexion', async (page) => {
      await page.goto('/connexion/association', { waitUntil: 'networkidle' })
      await page.getByLabel('Email').fill('awa@entraide.ci')
      await page.getByLabel('Mot de passe', { exact: true }).fill('motdepasse')
      await page.getByRole('button', { name: 'Se connecter' }).click()
      await page.waitForURL(u => new URL(u).pathname === '/asso')
    }],
    ['tableau-de-bord', async (page) => {
      await page.getByRole('main').getByRole('link', { name: /paiements? à valider|Voir la file|Valider les paiements/i }).first().click()
      await page.waitForURL('**/asso/paiements**')
    }],
    ['file', async (page) => {
      compteurAvant = await attendreCompteur(page, 'Paiements', n => n > 0)
      await assert(compteurAvant > 0, 'Compteur « Paiements » du menu : aucun paiement à valider affiché')
      await page.getByRole('link', { name: 'Ouvrir le détail complet →' }).first().click()
      await page.waitForURL(`**/asso/paiements/${PAIEMENT_AWA}`)
    }],
    ['valider', async (page) => {
      await page.getByRole('button', { name: 'Valider le paiement' }).click()
      await page.getByRole('button', { name: 'Oui, valider' }).click()
      await contient(page, 'Paiement validé', 'Message de confirmation de la validation')
      const apres = await attendreCompteur(page, 'Paiements', n => n === compteurAvant - 1)
      await assert(apres === compteurAvant - 1, `Compteur « Paiements » du menu : ${compteurAvant} → ${apres} (attendu ${compteurAvant - 1})`)
    }],
    ['grille-projet', async (page) => {
      await page.getByRole('navigation').getByRole('link', { name: 'Projets' }).first().click()
      await page.waitForURL('**/asso/projets')
      await page.getByRole('main').getByRole('link', { name: /Centre communautaire/ }).first().click()
      await page.waitForURL(`**/asso/projets/${ID.centre}`)
      await page.getByRole('main').getByRole('link', { name: /^Paiements/ }).first().click()
      await page.waitForURL(`**/asso/projets/${ID.centre}/paiements**`)
      const septembre = page.locator('[aria-label^="Awa Koné — Septembre 2026"]').first()
      await septembre.waitFor()
      const etiquette = await septembre.getAttribute('aria-label')
      await assert(etiquette.includes('Payée'), `Grille : échéance de septembre d’Awa Koné « ${etiquette} » (attendu : Payée)`)
      await assert(await page.locator('[aria-label^="Awa Koné — "][aria-label$="Déclarée, à valider"]').count() === 0, 'Grille : il reste des échéances d’Awa Koné « à valider »')
    }],
  ]),

  // Connexion plateforme → demande → approbation → association visible dans la liste.
  plateforme: () => parcours('plateforme', {}, [
    ['connexion', async (page) => {
      await page.goto('/connexion/plateforme', { waitUntil: 'networkidle' })
      await page.getByLabel('Email').fill('richy@cotiz.app')
      await page.getByLabel('Mot de passe', { exact: true }).fill('motdepasse')
      await page.getByRole('button', { name: 'Se connecter' }).click()
      await page.getByLabel('Chiffre 1').fill('481902')
      await page.getByRole('button', { name: 'Valider' }).click()
      await page.waitForURL(u => new URL(u).pathname === '/plateforme')
    }],
    ['tableau-de-bord', async (page) => {
      await contient(page, '4 demandes à traiter')
      await page.getByRole('link', { name: 'Examiner' }).first().click()
      await page.waitForURL(`**/plateforme/demandes/${DEMANDE_TONTINE}`)
    }],
    ['approbation', async (page) => {
      await page.getByRole('button', { name: 'Approuver et créer l’espace' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Approuver et créer l’espace' }).click()
      await page.getByRole('link', { name: 'Voir l’association créée' }).waitFor()
    }],
    ['compteurs', async (page) => {
      const badge = await texte(page.getByRole('navigation').getByRole('link', { name: /Demandes/ }).first())
      await assert(badge.includes('3'), `Le compteur « Demandes » du menu doit passer à 3 (lu : « ${badge} »)`)
    }],
    ['association-creee', async (page) => {
      await page.getByRole('link', { name: 'Voir l’association créée' }).click()
      await page.waitForURL('**/plateforme/associations/**')
      await contient(page, 'Tontine des commerçantes d’Adjamé')
    }],
    ['liste-associations', async (page) => {
      await page.getByRole('navigation').getByRole('link', { name: 'Associations' }).first().click()
      await page.waitForURL('**/plateforme/associations')
      await contient(page, 'Tontine des commerçantes d’Adjamé', 'La nouvelle association figure dans la liste')
    }],
  ]),
}

const choix = process.argv.slice(2)
let ok = true
for (const [nom, lancer] of Object.entries(PARCOURS)) {
  if (choix.length && !choix.includes(nom)) continue
  console.log(`\n▶ ${nom}`)
  ok = (await lancer()) && ok
}
process.exit(ok ? 0 : 1)
