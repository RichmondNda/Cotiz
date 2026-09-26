// Parcours d'interface de /demande (états de design/INVENTAIRE.md), rejoués par capture-ecran.mjs --etat.
// Données : celles de la maquette (Entraide Yopougon, Awa Koné).

const DESCRIPTION = 'Entraide entre familles du quartier de Yopougon : cotisations pour la construction d’un centre communautaire, une tontine solidaire et un voyage annuel.'

async function choisir(page, champ, option) {
  await page.getByRole('combobox', { name: champ }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function etape1(page) {
  await page.getByLabel('Nom de l’association').fill('Entraide Yopougon')
  await page.getByLabel('Ville').fill('Abidjan')
  await page.getByLabel('Description de l’activité').fill(DESCRIPTION)
}

async function etape2(page, { erreurs = false } = {}) {
  await page.getByLabel('Prénom').fill('Awa')
  await page.getByLabel(/^Nom\s*\*?$/).fill('Koné')
  await page.getByLabel('Fonction dans l’association').fill('Trésorière')
  await page.getByLabel('Email').fill(erreurs ? 'awa@entraide' : 'awa@entraide.ci')
  await page.getByLabel('Téléphone').fill(erreurs ? '070809' : '0708091011')
}

async function etape3(page) {
  await choisir(page, 'Nombre estimé de souscripteurs', 'Moins de 50')
  await choisir(page, 'Comment avez-vous connu Cotiz ?', 'Bouche-à-oreille')
  await page.getByRole('radio', { name: /Essentiel/ }).click()
  await page.getByRole('checkbox', { name: /conditions générales/ }).check({ force: true })
}

const continuer = page => page.getByRole('button', { name: 'Continuer' }).click()

export default {
  'navigable': async (page) => {
    await etape1(page)
  },
  'etape1-vide': async () => {},
  'etape2-erreurs': async (page) => {
    await etape1(page)
    await continuer(page)
    await etape2(page, { erreurs: true })
    await continuer(page)
  },
  'etape3-plan': async (page) => {
    await etape1(page)
    await continuer(page)
    await etape2(page)
    await continuer(page)
    await etape3(page)
  },
  'envoi-en-cours': async (page) => {
    // Retient la réponse de l'API pour photographier l'état d'envoi.
    await page.route('**/api/demandes', () => new Promise(() => {}))
    await etape1(page)
    await continuer(page)
    await etape2(page)
    await continuer(page)
    await etape3(page)
    await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
  },
  'confirmation': async (page) => {
    await etape1(page)
    await continuer(page)
    await etape2(page)
    await continuer(page)
    await etape3(page)
    await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
    await page.waitForURL('**/demande/confirmation')
    await page.waitForTimeout(900)
  },
}
