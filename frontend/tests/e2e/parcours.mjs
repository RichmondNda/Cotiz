// Parcours de fumée de la V0 (lots 09 et 0.3), rejoués sur le serveur de dev (mocks Nitro conformes au contrat).
//   node tests/e2e/parcours.mjs            → tous les parcours
//   node tests/e2e/parcours.mjs plateforme → un seul (jalon | public | souscripteur | gestionnaire | plateforme |
//                                            activation | reinitialisation | declaration | contrat | equipe)
//   COTIZ_BASE=http://localhost:3080 node tests/e2e/parcours.mjs jalon → boucle V1 complète sur la pile Docker (lot 3.5)
// Captures de chaque étape : .verif/e2e/<parcours>/. Code de sortie 1 si une étape échoue.
import { readFileSync } from 'node:fs'
import { ID, uid } from '../../server/mocks/ids.ts'
import { COMPTES } from '../../scripts/session-test.mjs'
import { assert, contient, EchecEtape, parcours, texte } from './outils.mjs'

/**
 * Compte plateforme : celui de seed-dev, ou (pile de production, tools/repetition-production.sh) l'owner créé par
 * `create-platform-owner` pour la répétition : COTIZ_SUPERADMIN_EMAIL et COTIZ_SUPERADMIN_PASSWORD.
 */
const SUPERADMIN = process.env.COTIZ_SUPERADMIN_EMAIL
  ? { identifiant: process.env.COTIZ_SUPERADMIN_EMAIL, password: process.env.COTIZ_SUPERADMIN_PASSWORD ?? '' }
  : COMPTES.superadmin

// Les routes portent les UUID déterministes du jeu simulé (server/mocks/ids.ts), plus des slugs.
const PAIEMENT_AWA = uid('payment', 'pm-awa-kone')
const DEMANDE_TONTINE = uid('request', 'tontine-commercantes-adjame')

let compteurAvant = 0

/** Montant tel que `texte()` le lit (espaces normalisées) : `75 000 F`. */
const formatFCFA = n => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`

/** Photo de reçu minimale (PNG 1 × 1 valide : le worker vérifie le type réel du contenu). */
const PNG_RECU = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

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

/**
 * Nouveau souscripteur réel (lots 2.3 et 3.1) : numéro tiré au hasard à chaque passage (rejouable sans réinitialiser la
 * base), inscrit par la gestionnaire d'Entraide Yopougon, puis activé avec le code remis (saisi en minuscules avec une
 * espace, comme recopié d'un message WhatsApp).
 */
const telephoneAuHasard = () => `07${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`

/**
 * `cadre` (parcours `jalon`) : projet et compte gestionnaire d'une association créée par le parcours ; sinon Centre
 * communautaire d'Entraide Yopougon, avec le compte d'Awa.
 */
function nouveauCompte(cadre = {}) {
  const projetId = cadre.projetId ?? (() => ID.centre)
  const gestionnaire = cadre.gestionnaire ?? { email: COMPTES.gestionnaire.identifiant, motDePasse: COMPTES.gestionnaire.password }
  const tel = telephoneAuHasard()
  const c = { tel, prenom: 'Aya', nom: `Essai${tel.slice(-4)}`, code: '', motDePasse: 'Plateau-Essai-2026' }
  c.connexionGestionnaire = async (page) => {
    await page.goto('/connexion/association', { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill(gestionnaire.email)
    await page.getByLabel('Mot de passe', { exact: true }).fill(gestionnaire.motDePasse)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await page.waitForURL(u => new URL(u).pathname.startsWith('/asso'))
  }
  c.inscrire = async (page) => {
    await page.goto(`/asso/projets/${projetId()}/souscripteurs`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Ajouter un souscripteur', exact: true }).first().click()
    await page.getByRole('textbox', { name: 'Téléphone' }).fill(tel)
    await page.getByRole('button', { name: 'Continuer', exact: true }).click()
    await page.getByRole('textbox', { name: 'Prénom' }).fill(c.prenom)
    await page.getByRole('textbox', { name: 'Nom', exact: true }).fill(c.nom)
    await page.getByRole('button', { name: 'Créer et inscrire', exact: true }).click()
    const valeur = page.locator('.handoff__valeur').first()
    await valeur.waitFor({ timeout: 10_000 })
    c.code = (await texte(valeur)).trim()
    await assert(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(c.code), `Code d’activation affiché : « ${c.code} »`)
  }
  c.activer = async (page) => {
    await page.context().clearCookies()
    await page.goto(`/activer?t=${encodeURIComponent(`+225${tel}`)}`, { waitUntil: 'networkidle' })
    const champ = await page.getByLabel('Téléphone').inputValue()
    await assert(champ.replace(/\D/g, '') === tel, `Téléphone pré-rempli depuis le lien : « ${champ} »`)
    await page.getByLabel('Code d’activation').fill(c.code.toLowerCase().replace('-', ' '))
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(c.motDePasse)
    await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(c.motDePasse)
    await page.getByRole('button', { name: 'Activer mon compte' }).click()
    await page.waitForURL('**/bienvenue', { timeout: 15_000 })
  }
  return c
}

/** Assistant de bout en bout ; renvoie l'id du paiement déclaré (page de confirmation, lue par me.payment). */
async function declarer(page, { montant, raccourci, reference, preuve, projetId = ID.centre }) {
  await page.goto(`/paiements/declarer?projet=${projetId}`, { waitUntil: 'networkidle' })
  if (raccourci) await page.getByRole('button', { name: raccourci }).click()
  else await page.getByLabel('Montant versé').fill(String(montant))
  await contient(page, `Total affecté ${formatFCFA(montant)}`, 'Répartition proposée : total affecté')
  const cochees = await page.getByRole('checkbox', { checked: true }).evaluateAll(els => els.map(e => e.closest('label, li, div')?.innerText.split('\n')[0].trim() ?? ''))
  await page.getByRole('button', { name: 'Continuer' }).click()
  if (reference) await page.getByLabel('Référence de la transaction').fill(reference)
  if (preuve) {
    await page.locator('input[type="file"]:not([capture])').setInputFiles(preuve)
    await contient(page, preuve.name, 'Preuve choisie affichée')
  }
  await page.getByRole('button', { name: 'Continuer' }).click()
  await contient(page, formatFCFA(montant), 'Récapitulatif : montant déclaré')
  await page.getByRole('button', { name: 'Envoyer ma déclaration' }).click()
  await page.waitForURL('**/paiements/declarer/ok**', { timeout: 30_000 })
  await page.getByRole('heading', { name: 'Déclaration envoyée !' }).waitFor()
  await contient(page, formatFCFA(montant), 'Confirmation : montant déclaré (me.payment)')
  const id = new URL(page.url()).searchParams.get('paiement') ?? ''
  await assert(/^[0-9a-f-]{36}$/.test(id), `Identifiant du paiement déclaré : « ${id} »`)
  return { id, cochees }
}
/** Le gestionnaire de `c` (autre navigateur) valide le paiement `id` ; `verifier(g)` : contrôles avant fermeture. */
async function valider(c, page, id, verifier = async () => {}) {
  const gestion = await page.context().browser().newContext({ baseURL: new URL(page.url()).origin, viewport: { width: 1440, height: 900 } })
  try {
    const g = await gestion.newPage()
    await c.connexionGestionnaire(g)
    await g.goto(`/asso/paiements/${id}`, { waitUntil: 'networkidle' })
    await contient(g, `${c.prenom} ${c.nom}`, 'Détail du paiement : nom du souscripteur')
    await verifier(g, 'avant')
    await g.getByRole('button', { name: 'Valider le paiement' }).click()
    await g.getByRole('button', { name: 'Oui, valider' }).click()
    await contient(g, 'Paiement validé', 'Message de confirmation de la validation')
    await verifier(g, 'apres')
  }
  finally {
    await gestion.close()
  }
}

const PARCOURS = {
  jalon,
  contrat,
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

  // Connexion souscripteur → accueil → projet en retard → déclarer un paiement (jusqu'au récapitulatif, sans envoi).
  souscripteur: () => parcours('souscripteur', {}, [
    ['connexion', async (page) => {
      await page.goto('/connexion', { waitUntil: 'networkidle' })
      await page.getByLabel('Téléphone').fill(COMPTES.souscripteur.identifiant)
      await page.getByLabel('Mot de passe', { exact: true }).fill(COMPTES.souscripteur.password)
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
    ['recapitulatif', async (page) => {
      // Envoi réel depuis le lot 3.3 (me.declare) : il changerait les échéances de Moussa d'un passage à l'autre. Le
      // parcours `declaration` envoie, valide et vérifie, sur un compte neuf.
      await contient(page, '75 000 F', 'Récapitulatif : montant déclaré')
      await page.getByRole('button', { name: 'Envoyer ma déclaration' }).waitFor()
    }],
  ]),

  // Connexion gestionnaire → tableau de bord → paiements à valider → détail → valider → grille du projet.
  gestionnaire: () => parcours('gestionnaire', {}, [
    ['connexion', async (page) => {
      await page.goto('/connexion/association', { waitUntil: 'networkidle' })
      await page.getByLabel('Email').fill(COMPTES.gestionnaire.identifiant)
      await page.getByLabel('Mot de passe', { exact: true }).fill(COMPTES.gestionnaire.password)
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

  // Connexion plateforme → demande → approbation → accès du gestionnaire à remettre (base fraîche : seed-dev).
  plateforme: () => parcours('plateforme', {}, [
    ['connexion', async (page) => {
      await page.goto('/connexion/plateforme', { waitUntil: 'networkidle' })
      // Espace basculé (lot 1.1) : vraie connexion avec le compte de développement, sans second facteur (TOTP au lot 4.7).
      await page.getByLabel('Email').fill(SUPERADMIN.identifiant)
      await page.getByLabel('Mot de passe', { exact: true }).fill(SUPERADMIN.password)
      await page.getByRole('button', { name: 'Se connecter' }).click()
      await page.waitForURL(u => new URL(u).pathname === '/plateforme')
    }],
    ['tableau-de-bord', async (page) => {
      // Compteur du menu : file réelle (pf.req.list), qui suit l'état de la base (seed-dev + la demande du parcours
      // public). Le tableau de bord (pf.dashboard, lu en direct) annonce le même nombre.
      compteurAvant = await attendreCompteur(page, 'Demandes', n => n > 0)
      await contient(page, `${compteurAvant} demandes à traiter`)
      await page.getByRole('link', { name: 'Examiner' }).first().click()
      await page.waitForURL(`**/plateforme/demandes/${DEMANDE_TONTINE}`)
    }],
    ['approbation', async (page) => {
      await page.getByRole('button', { name: 'Approuver et créer l’espace' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Approuver et créer l’espace' }).click()
      await page.getByRole('link', { name: 'Voir l’association créée' }).waitFor()
    }],
    ['compteurs', async (page) => {
      const n = await attendreCompteur(page, 'Demandes', x => x === compteurAvant - 1)
      await assert(n === compteurAvant - 1, `Le compteur « Demandes » du menu doit passer de ${compteurAvant} à ${compteurAvant - 1} (lu : ${n})`)
    }],
    // Pas d'email (ui-deviations.md) : les accès du responsable s'affichent une fois, à transmettre soi-même.
    ['acces-du-gestionnaire', async (page) => {
      const carte = page.getByRole('region', { name: 'Accès du gestionnaire' })
      await carte.waitFor()
      await assert(/[A-Z0-9]{4}-[A-Z0-9]{4}/.test(await texte(carte)), 'Code d’activation affiché dans la carte « Accès du gestionnaire »')
      await carte.getByRole('button', { name: 'Copier le message' }).waitFor()
    }],
    // Fiche et liste des associations réelles (lot 1.4 : pf.asso.get, pf.asso.list).
    ['fiche-association', async (page) => {
      await page.getByRole('link', { name: 'Voir l’association créée' }).click()
      await page.waitForURL(u => /^\/plateforme\/associations\/[0-9a-f-]{36}$/.test(new URL(u).pathname))
      // Le titre porte aussi le badge de statut : le nom seul est son premier nœud texte.
      const nom = (await page.getByRole('heading', { level: 1 }).evaluate(h => h.firstChild?.textContent ?? '')).trim()
      await assert(nom.length > 0, 'Nom de l’association lu dans le titre de la fiche')
      await page.getByRole('navigation').getByRole('link', { name: 'Associations' }).first().click()
      await page.waitForURL('**/plateforme/associations')
      await contient(page, nom, `La nouvelle association « ${nom} » doit figurer dans la liste`)
    }],
  ]),

  // Lot 3.1, étape 1 : un code réel (lot 2.3) remis par le gestionnaire active le compte du souscripteur. Numéro tiré au
  // hasard à chaque passage (rejouable sans réinitialiser la base) ; code saisi en minuscules avec une espace, comme
  // recopié d'un message WhatsApp ; le compte quitte « Codes à remettre » et le gestionnaire est notifié.
  activation: () => {
    const c = nouveauCompte()
    const { prenom, nom, connexionGestionnaire } = c
    return parcours('activation', {}, [
      ['connexion-gestionnaire', connexionGestionnaire],
      ['inscription-nouveau-compte', c.inscrire],
      ['codes-a-remettre', async (page) => {
        await page.goto('/asso/souscripteurs/codes', { waitUntil: 'networkidle' })
        await contient(page, `${prenom} ${nom}`, 'Le nouveau compte doit figurer dans « Codes à remettre »')
      }],
      ['activation', c.activer],
      ['bienvenue', async (page) => {
        await contient(page, `Bienvenue ${prenom} !`, 'Première diapositive : prénom de la personne activée')
        await contient(page, 'Entraide Yopougon vous a inscrit', 'Première diapositive : association qui a inscrit la personne')
      }],
      ['code-consomme', async (page) => {
        await page.context().clearCookies()
        await connexionGestionnaire(page)
        await page.goto('/asso/souscripteurs/codes', { waitUntil: 'networkidle' })
        await contient(page, 'Codes à remettre', 'Écran « Codes à remettre »')
        await page.waitForTimeout(1000)
        await assert(!(await texte(page.locator('main'))).includes(`${prenom} ${nom}`),
          'Le compte activé ne doit plus figurer dans « Codes à remettre »')
      }],
      ['notification-gestionnaire', async (page) => {
        // Consommateur de user.activated (lot 2.5) : quelques secondes après l'activation, par l'outbox et le worker.
        for (let i = 0; i < 4; i++) {
          await page.waitForTimeout(2000)
          await page.goto('/asso/notifications', { waitUntil: 'networkidle' })
          if ((await texte(page.locator('main'))).includes(`${prenom} ${nom} a activé son compte`)) return
        }
        throw new EchecEtape(`Notification « ${prenom} ${nom} a activé son compte » absente`)
      }],
    ])
  },
  // Lot 3.1, étape 3 : un souscripteur qui a oublié son mot de passe le récupère sans fournisseur. Demande depuis
  // « Mot de passe oublié », code à 6 chiffres généré par Awa (Réinitialisations, identité vérifiée hors ligne), saisi par
  // le souscripteur, nouveau mot de passe, connexion.
  // Lot 4.5 : Awa invite une gestionnaire (code team_invite et message prêt, sans email), la personne active son compte
  // avec ce code depuis /activer, puis Awa lui retire l'accès (la place se libère : parcours rejouable).
  equipe: () => {
    const c = nouveauCompte()
    const suffixe = String(Date.now()).slice(-6)
    const invitee = { prenom: 'Mariam', nom: `Diallo ${suffixe}`, email: `equipe-${suffixe}@essai.cotiz.app`, motDePasse: 'Lagune-Equipe-2027' }
    let code = ''
    return parcours('equipe', {}, [
      ['connexion-gestionnaire', c.connexionGestionnaire],
      ['invitation', async (page) => {
        // Flux temps réel de la cloche (SSE) : le réseau n'est jamais au repos sur la pile réelle.
        await page.goto('/asso/equipe', { waitUntil: 'load' })
        await page.getByRole('row').filter({ hasText: 'Principale' }).first().waitFor()
        await page.getByRole('button', { name: 'Inviter un gestionnaire' }).filter({ visible: true }).first().click()
        await page.getByPlaceholder('Prénom').fill(invitee.prenom)
        await page.getByPlaceholder('Nom', { exact: true }).fill(invitee.nom)
        await page.getByPlaceholder('nom@exemple.com').fill(invitee.email)
        const reponse = page.waitForResponse(r => r.url().endsWith('/team/invitations'))
        await page.getByRole('button', { name: 'Envoyer l’invitation' }).click()
        await assert((await reponse).status() === 201, 'Invitation créée (201)')
        const valeur = page.locator('.handoff__valeur').first()
        await valeur.waitFor({ timeout: 10_000 })
        code = (await texte(valeur)).trim()
        await assert(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(code), `Code d’invitation affiché : « ${code} »`)
        const message = await page.getByRole('dialog').locator('textarea').first().inputValue()
        await assert(message.includes('vous invite à rejoindre son équipe') && message.includes(code), 'Message prêt de l’invitation, avec le code')
        await page.keyboard.press('Escape')
        await contient(page, 'Invitation envoyée', 'Ligne de l’invitée')
      }],
      ['activation-invitee', async (page) => {
        const autre = await page.context().browser().newContext({ baseURL: new URL(page.url()).origin })
        try {
          const p = await autre.newPage()
          await p.goto('/activer?espace=association', { waitUntil: 'load' })
          await p.getByLabel('Email').fill(invitee.email)
          await p.getByLabel('Code d’activation').fill(code)
          await p.getByLabel('Nouveau mot de passe', { exact: true }).fill(invitee.motDePasse)
          await p.getByLabel('Confirmer le mot de passe', { exact: true }).fill(invitee.motDePasse)
          await p.getByRole('button', { name: 'Activer mon compte' }).click()
          await p.waitForURL(u => new URL(u).pathname.startsWith('/asso'), { timeout: 15_000 })
        }
        finally {
          await autre.close()
        }
        await page.reload({ waitUntil: 'load' })
        const ligne = page.getByRole('row').filter({ hasText: invitee.nom })
        await ligne.waitFor()
        await assert(await ligne.getByText('Actif').isVisible(), 'L’invitée est active dans l’équipe')
      }],
      ['retrait', async (page) => {
        const ligne = page.getByRole('row').filter({ hasText: invitee.nom })
        await ligne.getByRole('button', { name: /Actions pour/ }).click()
        await page.getByRole('menuitem', { name: 'Retirer l’accès' }).click()
        const reponse = page.waitForResponse(r => r.request().method() === 'DELETE' && r.url().includes('/team/'))
        await page.getByRole('dialog').getByRole('button', { name: 'Retirer l’accès' }).click()
        await assert((await reponse).status() === 204, 'Accès retiré (204)')
        await page.waitForTimeout(500)
        await assert(!(await page.getByRole('main').getByText(invitee.nom).isVisible()), 'L’invitée ne figure plus dans l’équipe')
      }],
    ])
  },
  reinitialisation: () => {
    const c = nouveauCompte()
    const nouveau = 'Lagune-Oubli-2027'
    let code = ''
    return parcours('reinitialisation', {}, [
      ['connexion-gestionnaire', c.connexionGestionnaire],
      ['inscription-nouveau-compte', c.inscrire],
      ['activation', c.activer],
      ['mot-de-passe-oublie', async (page) => {
        await page.context().clearCookies()
        await page.goto('/mot-de-passe', { waitUntil: 'networkidle' })
        await page.getByLabel('Téléphone').fill(c.tel)
        const reponse = page.waitForResponse('**/api/v1/auth/password/forgot')
        await page.getByRole('button', { name: 'Recevoir un code' }).click()
        await assert((await reponse).status() === 202, 'Demande transmise (202)')
        await page.getByRole('heading', { name: 'Saisissez le code' }).waitFor()
      }],
      ['code-genere-par-awa', async (page) => {
        const souscripteur = await page.context().browser().newContext({ baseURL: new URL(page.url()).origin })
        try {
          const gestion = await souscripteur.newPage()
          await c.connexionGestionnaire(gestion)
          await gestion.goto('/asso/souscripteurs', { waitUntil: 'networkidle' })
          await gestion.getByRole('link', { name: 'Réinitialisations' }).first().click()
          await gestion.waitForURL('**/asso/souscripteurs/reinitialisations')
          const ligne = gestion.getByRole('row').filter({ hasText: `${c.prenom} ${c.nom}` })
          await ligne.getByRole('button', { name: 'Générer un code' }).click()
          await gestion.getByRole('button', { name: 'J’ai vérifié, générer le code' }).click()
          const valeur = gestion.locator('.handoff__valeur').first()
          await valeur.waitFor({ timeout: 10_000 })
          code = (await texte(valeur)).replace(/\D/g, '')
          await assert(/^\d{6}$/.test(code), 'Code de réinitialisation à 6 chiffres affiché')
          await gestion.getByRole('dialog').getByRole('button', { name: 'Fermer', exact: true }).last().click()
          await gestion.getByRole('button', { name: 'Codes remis', exact: true }).click()
          await contient(gestion, `${c.prenom} ${c.nom}`, 'La demande passe dans « Codes remis »')
        }
        finally {
          await souscripteur.close()
        }
      }],
      ['nouveau-mot-de-passe', async (page) => {
        await page.getByLabel('Chiffre 1').fill(code)
        await page.getByRole('button', { name: 'Vérifier le code' }).click()
        await page.getByRole('heading', { name: 'Nouveau mot de passe' }).waitFor()
        await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(nouveau)
        await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(nouveau)
        await page.getByRole('button', { name: 'Enregistrer' }).click()
        await page.getByRole('heading', { name: 'Mot de passe modifié' }).waitFor()
      }],
      ['connexion-nouveau-mot-de-passe', async (page) => {
        await page.goto('/connexion', { waitUntil: 'networkidle' })
        await page.getByLabel('Téléphone').fill(c.tel)
        await page.getByLabel('Mot de passe', { exact: true }).fill(nouveau)
        await page.getByRole('button', { name: 'Me connecter' }).click()
        await page.waitForURL(u => !new URL(u).pathname.startsWith('/connexion'), { timeout: 15_000 })
      }],
    ])
  },
  // Lot 3.3, étape 4 : un compte neuf (rejouable sans réinitialiser la base) déclare 75 000 F couvrant 3 échéances avec
  // la photo du reçu (dépôt réel, analyse, rattachement) ; Awa valide ; les 3 cases passent à « Payée » ; le souscripteur
  // est notifié. Compte neuf = fonds d'entrée (50 000 F) en tête : d'abord déclaré par référence et validé, pour que les
  // 75 000 F couvrent trois mois, comme pour Moussa.
  declaration: () => {
    const c = nouveauCompte()
    const nom = `${c.prenom} ${c.nom}`
    let mois = []
    let paiementId = ''
    return parcours('declaration', {}, [
      ['connexion-gestionnaire', c.connexionGestionnaire],
      ['inscription-nouveau-compte', c.inscrire],
      ['activation', c.activer],
      ['fonds-d-entree', async (page) => {
        const { id, cochees } = await declarer(page, { montant: 50000, reference: 'OM-E2E-ENTREE' })
        await assert(cochees.length === 1 && cochees[0].startsWith('Fonds d’entrée'), `Fonds d’entrée seul couvert : ${JSON.stringify(cochees)}`)
        await valider(c, page, id)
      }],
      ['declaration-75000', async (page) => {
        const preuve = { name: 'recu-orange.png', mimeType: 'image/png', buffer: Buffer.from(PNG_RECU, 'base64') }
        const { id, cochees } = await declarer(page, { montant: 75000, raccourci: /3 mois/, preuve })
        mois = cochees.map(t => /^\p{L}+ \d{4}/u.exec(t)?.[0]).filter(Boolean)
        await assert(mois.length === 3, `Trois échéances mensuelles couvertes : ${JSON.stringify(cochees)}`)
        paiementId = id
      }],
      ['validation-et-grille', async (page) => {
        await valider(c, page, paiementId, async (g, moment) => {
          if (moment === 'avant') {
            await contient(g, 'recu-orange.png', 'Détail du paiement : preuve rattachée à l’association')
            return
          }
          await g.goto(`/asso/projets/${ID.centre}/paiements`, { waitUntil: 'networkidle' })
          for (const m of mois) {
            const cellule = g.locator(`[aria-label^="${nom} — ${m}"]`).first()
            await cellule.waitFor()
            const etiquette = await cellule.getAttribute('aria-label')
            await assert(etiquette.includes('Payée'), `Grille : « ${etiquette} » (attendu : Payée)`)
          }
        })
      }],
      ['notification-souscripteur', async (page) => {
        // Consommateur de payment.validated (lot 2.5), par l'outbox et le worker : quelques secondes.
        for (let i = 0; i < 5; i++) {
          await page.goto('/notifications', { waitUntil: 'networkidle' })
          if ((await texte(page.locator('main'))).includes(`Vos ${formatFCFA(75000)} pour Centre communautaire`)) return
          await page.waitForTimeout(2000)
        }
        throw new EchecEtape('Notification « Paiement validé » (75 000 F, Centre communautaire) absente')
      }],
    ])
  },
}

/**
 * Lot 4.1 : contrat de bout en bout, contre api et worker réels (Gotenberg et MinIO compris). Awa (plan Essentiel :
 * fonctionnalité `contracts`) crée un projet avec contrat signé au nom de l'association (assistant en 6 étapes) — ou
 * reprend celui d'un passage précédent (quota de projets du plan) —, inscrit un nouveau compte (inscription en attente de
 * signature), qui s'active, lit son contrat personnalisé, le signe et télécharge le PDF signé produit par le worker ;
 * Awa voit la signature dans « Contrats ».
 */
const PROJET_CONTRAT = 'Caisse de prévoyance (contrat e2e)'
function contrat() {
  const projet = { id: '' }
  const c = nouveauCompte({ projetId: () => projet.id })
  return parcours('contrat', {}, [
    ['connexion-gestionnaire', c.connexionGestionnaire],
    ['projet-avec-contrat', async (page) => {
      await page.goto('/asso/projets', { waitUntil: 'networkidle' })
      const existant = page.getByRole('main').getByText(PROJET_CONTRAT, { exact: true }).first()
      if (await existant.isVisible().catch(() => false)) {
        await existant.click()
        await page.waitForURL(u => /^\/asso\/projets\/[0-9a-f-]{36}$/.test(new URL(u).pathname))
        projet.id = /\/asso\/projets\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? ''
        return
      }
      await page.goto('/asso/projets/nouveau', { waitUntil: 'networkidle' })
      // Assistant en 6 étapes : « Contrat » présente (fonctionnalité contracts du plan, GET /me).
      await page.locator('.creation__etapes').waitFor()
      const etapes = await texte(page.locator('.creation__etapes'))
      await assert(etapes.includes('Contrat') && etapes.includes('6'), `Indicateur d’étapes : « ${etapes} »`)
      await page.getByRole('textbox', { name: 'Nom du projet' }).fill(PROJET_CONTRAT)
      await page.getByRole('button', { name: 'Continuer' }).click()
      await page.getByRole('textbox', { name: 'Montant du fonds d’entrée' }).fill('10000')
      await page.getByRole('textbox', { name: 'Montant par échéance' }).fill('5000')
      await page.getByRole('button', { name: 'Continuer' }).click()
      await page.getByRole('textbox', { name: 'Date de début' }).fill('05/01/2027')
      await page.getByRole('textbox', { name: 'Date de fin' }).fill('05/12/2027')
      await page.getByRole('button', { name: 'Continuer' }).click()
      await page.getByRole('button', { name: 'Continuer' }).click()
      const texteContrat = await page.getByRole('textbox', { name: 'Texte du contrat' }).inputValue()
      await assert(texteContrat.includes('{nom_souscripteur}'), `Modèle de contrat prérempli : « ${texteContrat.slice(0, 80)}… »`)
      await page.getByRole('checkbox', { name: /Je signe ce contrat/ }).check({ force: true })
      await page.getByRole('button', { name: 'Continuer' }).click()
      await page.getByRole('button', { name: 'Créer le projet' }).click()
      await page.getByText('Projet créé !').waitFor({ timeout: 15_000 })
      const lien = await page.getByRole('link', { name: 'Voir le projet' }).first().getAttribute('href')
      projet.id = /\/asso\/projets\/([0-9a-f-]{36})/.exec(lien ?? '')?.[1] ?? ''
      await assert(projet.id !== '', `Identifiant du projet créé : « ${lien} »`)
    }],
    ['onglet-contrat', async (page) => {
      await page.goto(`/asso/projets/${projet.id}/contrat`, { waitUntil: 'networkidle' })
      await contient(page, 'm’engage à verser', 'Onglet Contrat : texte du modèle (ct.get)')
    }],
    ['inscription-nouveau-compte', c.inscrire],
    ['activation', c.activer],
    ['signature', async (page) => {
      await page.goto(`/projets/${projet.id}/contrat`, { waitUntil: 'networkidle' })
      await contient(page, `${c.prenom} ${c.nom}`, 'Contrat personnalisé : nom du souscripteur (me.contract)')
      await page.getByText('J’ai lu et j’accepte les termes du contrat.').click()
      await page.getByRole('button', { name: 'Signer le contrat' }).click()
      await page.getByRole('heading', { name: 'Contrat signé !' }).waitFor({ timeout: 15_000 })
    }],
    ['pdf-signe', async (page) => {
      // PDF produit par le worker (outbox → documents → Gotenberg) : quelques secondes après la signature.
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(2000)
        const telechargement = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)
        await page.getByRole('button', { name: 'Télécharger le contrat signé' }).first().click()
        const fichier = await telechargement
        if (!fichier) continue
        await assert(fichier.suggestedFilename().endsWith('.pdf'), `Nom du fichier : « ${fichier.suggestedFilename()} »`)
        const chemin = await fichier.path()
        const debut = chemin ? readFileSync(chemin).subarray(0, 5).toString('latin1') : ''
        await assert(debut === '%PDF-', `Contenu PDF attendu (lu : « ${debut} »)`)
        return
      }
      throw new EchecEtape('PDF du contrat signé jamais disponible (worker documents, Gotenberg)')
    }],
    ['mes-contrats', async (page) => {
      await page.goto('/contrats', { waitUntil: 'networkidle' })
      await contient(page, PROJET_CONTRAT, 'Mes contrats : contrat signé du projet (me.contracts)')
    }],
    ['contrats-gestionnaire', async (page) => {
      await page.context().clearCookies()
      await c.connexionGestionnaire(page)
      await page.goto('/asso/contrats', { waitUntil: 'networkidle' })
      await contient(page, PROJET_CONTRAT, 'Contrats de l’association : projet sous contrat (ct.list)')
    }],
  ])
}

/**
 * Lot 3.5, étape 1 : boucle complète du jalon V1 sur une association neuve (rejouable sans réinitialiser la base), contre
 * api et worker réels, sans fournisseur : demande publique → Richy approuve et remet les accès → la responsable active son
 * compte → assistant de démarrage → projet → inscription d'un souscripteur et code remis → activation → déclaration d'un
 * paiement couvrant trois échéances (fonds d'entrée + deux mois) avec la photo du reçu → validation → notification.
 * Attention : 5 demandes publiques par heure et par IP (pub.request) : au-delà, la première étape reçoit 429. Reprise
 * sans nouvelle demande : `COTIZ_JALON_REPRISE=<email>` repart d'une association déjà approuvée et configurée par un
 * passage précédent (mêmes mot de passe), à partir de la connexion de sa responsable.
 */
/**
 * Pile de dev (mocks Nitro) : un endpoint d'un lot ultérieur encore simulé ne connaît pas l'entité créée en réel et répond
 * 404 (écart de transition, frontend/CLAUDE.md). Toléré ici seulement ; `COTIZ_STRICT=1` (pile de production, lot 3.5
 * étape 4, `NUXT_MOCKS=0`) : aucun appel de ce genre ne doit plus partir.
 */
// ct.get : réel depuis le lot 4.1 (et appelé seulement si le plan comprend les contrats) : plus aucun écart toléré.
const SIMULES_LOTS_ULTERIEURS = []
const tolererSimules = r => process.env.COTIZ_STRICT !== '1' && r.status() === 404
  && SIMULES_LOTS_ULTERIEURS.some(motif => motif.test(new URL(r.url()).pathname))

function jalon() {
  const suffixe = String(Date.now()).slice(-6)
  const reprise = process.env.COTIZ_JALON_REPRISE
  const asso = {
    nom: `Coopérative Essai ${suffixe}`,
    email: reprise ?? `jalon-${suffixe}@essai.cotiz.app`,
    motDePasse: 'Lagune-Jalon-2026',
    code: '',
  }
  const projet = { nom: `Puits du village ${suffixe}`, id: '' }
  const c = nouveauCompte({ projetId: () => projet.id, gestionnaire: { email: asso.email, motDePasse: asso.motDePasse } })
  const nomSouscripteur = `${c.prenom} ${c.nom}`
  let paiementId = ''
  const suivant = async (page, libelle) => {
    await page.getByRole('button', { name: libelle }).filter({ visible: true }).first().click()
  }
  /** Reprise : plan Découverte (un seul projet) : le projet créé au premier passage. */
  const projetExistant = async (page) => {
    await page.goto('/asso/projets', { waitUntil: 'networkidle' })
    const carte = page.getByRole('main').getByText(/^Puits du village \d+$/).first()
    projet.nom = (await carte.textContent())?.trim() ?? projet.nom
    await carte.click()
    await page.waitForURL(u => /^\/asso\/projets\/[0-9a-f-]{36}$/.test(new URL(u).pathname))
    projet.id = /\/asso\/projets\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? ''
    await assert(projet.id !== '', `Projet existant de l’association reprise : « ${page.url()} »`)
  }
  const debut = [
    ['demande', async (page) => {
      await page.goto('/demande', { waitUntil: 'networkidle' })
      await page.getByLabel('Nom de l’association').fill(asso.nom)
      await page.getByLabel('Ville').fill('Bouaké')
      await page.getByLabel('Description de l’activité').fill('Cotisations des familles pour creuser un puits au village.')
      await page.getByRole('button', { name: 'Continuer' }).click()
      await page.getByLabel('Prénom').fill('Mariam')
      await page.getByLabel(/^Nom\s*\*?$/).fill('Traoré')
      await page.getByLabel('Fonction dans l’association').fill('Présidente')
      await page.getByLabel('Email').fill(asso.email)
      await page.getByLabel('Téléphone').fill(telephoneAuHasard())
      await page.getByRole('button', { name: 'Continuer' }).click()
      await page.getByRole('combobox', { name: 'Nombre estimé de souscripteurs' }).click()
      await page.getByRole('option', { name: 'Moins de 50', exact: true }).click()
      await page.getByRole('combobox', { name: 'Comment avez-vous connu Cotiz ?' }).click()
      await page.getByRole('option', { name: 'Bouche-à-oreille', exact: true }).click()
      await page.getByRole('radio', { name: /Découverte/ }).click()
      await page.getByRole('checkbox', { name: /conditions générales/ }).check({ force: true })
      await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
      await page.waitForURL('**/demande/confirmation', { timeout: 30_000 })
      await contient(page, asso.email, 'Confirmation : email de réponse')
    }],
    ['approbation', async (page) => {
      await page.goto('/connexion/plateforme', { waitUntil: 'networkidle' })
      await page.getByLabel('Email').fill(SUPERADMIN.identifiant)
      await page.getByLabel('Mot de passe', { exact: true }).fill(SUPERADMIN.password)
      await page.getByRole('button', { name: 'Se connecter' }).click()
      await page.waitForURL(u => new URL(u).pathname === '/plateforme')
      await page.goto('/plateforme/demandes', { waitUntil: 'networkidle' })
      await page.getByRole('link', { name: asso.nom }).first().click()
      await page.waitForURL(u => /^\/plateforme\/demandes\/[0-9a-f-]{36}$/.test(new URL(u).pathname))
      await page.getByRole('button', { name: 'Approuver et créer l’espace' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Approuver et créer l’espace' }).click()
      // Pas d'email (ui-deviations.md) : les accès de la responsable s'affichent une fois, à transmettre soi-même.
      const carte = page.getByRole('region', { name: 'Accès du gestionnaire' })
      await carte.waitFor({ timeout: 15_000 })
      asso.code = /[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}/.exec(await texte(carte))?.[0] ?? ''
      await assert(asso.code !== '', 'Code d’activation de la responsable affiché dans « Accès du gestionnaire »')
    }],
    ['activation-responsable', async (page) => {
      await page.context().clearCookies()
      await page.goto('/activer?espace=association', { waitUntil: 'networkidle' })
      await page.getByLabel('Email').fill(asso.email)
      await page.getByLabel('Code d’activation').fill(asso.code)
      await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(asso.motDePasse)
      await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(asso.motDePasse)
      await page.getByRole('button', { name: 'Activer mon compte' }).click()
      await page.waitForURL('**/asso/bienvenue', { timeout: 15_000 })
    }],
    ['assistant-de-demarrage', async (page) => {
      await contient(page, asso.nom, 'Assistant : nom de l’association approuvée')
      await suivant(page, 'Commencer')
      await suivant(page, 'Continuer')
      // Moyens de paiement : Mobile money seul (la déclaration du souscripteur choisira parmi les moyens du projet).
      await page.getByRole('checkbox', { name: 'Mobile money' }).check({ force: true })
      await page.getByLabel('Numéro et opérateur').fill('07 01 02 03 04 · Wave')
      await suivant(page, 'Continuer')
      await page.getByRole('heading', { name: 'C’est prêt !' }).waitFor({ timeout: 15_000 })
    }],
  ]
  return parcours('jalon', { tolerer: tolererSimules }, [
    ...(reprise ? [['connexion-responsable', c.connexionGestionnaire], ['projet-existant', projetExistant]] : debut),
    ...(reprise
      ? []
      : [['projet', async (page) => {
          await page.goto('/asso/projets/nouveau', { waitUntil: 'networkidle' })
          await page.getByRole('textbox', { name: 'Nom du projet' }).fill(projet.nom)
          await page.getByRole('textbox', { name: 'Description' }).fill('Creusement et équipement d’un puits pour les familles du village.')
          await page.getByRole('button', { name: 'Continuer' }).click()
          await page.getByRole('textbox', { name: 'Montant du fonds d’entrée' }).fill('50000')
          await page.getByRole('textbox', { name: 'Montant par échéance' }).fill('25000')
          await page.getByRole('button', { name: 'Continuer' }).click()
          await page.getByRole('textbox', { name: 'Date de début' }).fill('05/03/2026')
          await page.getByRole('textbox', { name: 'Date de fin' }).fill('05/08/2027')
          await page.getByRole('button', { name: 'Continuer' }).click()
          await page.getByRole('button', { name: 'Continuer' }).click()
          await page.getByRole('button', { name: 'Créer le projet' }).click()
          await page.getByText('Projet créé !').waitFor({ timeout: 15_000 })
          const lien = await page.getByRole('link', { name: 'Voir le projet' }).first().getAttribute('href')
          projet.id = /\/asso\/projets\/([0-9a-f-]{36})/.exec(lien ?? '')?.[1] ?? ''
          await assert(projet.id !== '', `Identifiant du projet créé : « ${lien} »`)
        }]]),
    ['inscription-et-code', c.inscrire],
    ['activation-souscripteur', c.activer],
    ['declaration-plusieurs-echeances', async (page) => {
      const preuve = { name: 'recu-wave.png', mimeType: 'image/png', buffer: Buffer.from(PNG_RECU, 'base64') }
      const { id, cochees } = await declarer(page, { montant: 100000, preuve, projetId: projet.id })
      await assert(cochees.length === 3 && cochees[0].startsWith('Fonds d’entrée'),
        `Fonds d’entrée et deux mois couverts par un seul paiement : ${JSON.stringify(cochees)}`)
      paiementId = id
    }],
    ['validation', async (page) => {
      await valider(c, page, paiementId, async (g, moment) => {
        if (moment === 'avant') await contient(g, 'recu-wave.png', 'Détail du paiement : preuve rattachée à l’association')
      })
    }],
    ['notification-souscripteur', async (page) => {
      for (let i = 0; i < 5; i++) {
        await page.goto('/notifications', { waitUntil: 'networkidle' })
        if ((await texte(page.locator('main'))).includes(`Vos ${formatFCFA(100000)} pour ${projet.nom}`)) return
        await page.waitForTimeout(2000)
      }
      throw new EchecEtape(`Notification « Paiement validé » (100 000 F, ${projet.nom}) pour ${nomSouscripteur} absente`)
    }],
  ])
}

const choix = process.argv.slice(2)
let ok = true
for (const [nom, lancer] of Object.entries(PARCOURS)) {
  if (choix.length && !choix.includes(nom)) continue
  console.log(`\n▶ ${nom}`)
  ok = (await lancer()) && ok
}
process.exit(ok ? 0 : 1)
