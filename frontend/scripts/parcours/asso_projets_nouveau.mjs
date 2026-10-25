// Parcours de /asso/projets/nouveau (MgNouveauProjet) : étapes et succès, avec les données de la maquette.
// Étape « Contrat » masquée jusqu'au lot 4.1 (ui-deviations) : pas d'état `5`, l'état `6` (récapitulatif) est la 5e étape.
const DESCRIPTION = 'Construction d’un centre communautaire pour les familles du quartier : salle de réunion, bibliothèque et espace pour les enfants.'

const continuer = page => page.getByRole('button', { name: 'Continuer' }).click()

async function etape1(page) {
  await page.getByRole('textbox', { name: 'Nom du projet' }).fill('Centre communautaire')
  await page.getByRole('textbox', { name: 'Description' }).fill(DESCRIPTION)
  const compteur = page.getByRole('spinbutton', { name: 'Nombre de souscripteurs requis' })
  await compteur.focus()
  for (let i = 0; i < 50; i++) await compteur.press('ArrowUp')
}
async function etape2(page) {
  await page.getByRole('textbox', { name: 'Montant du fonds d’entrée' }).fill('50000')
  await page.getByRole('textbox', { name: 'Montant par échéance' }).fill('25000')
}
async function etape3(page) {
  await page.getByRole('textbox', { name: 'Date de début' }).fill('05/03/2026')
  await page.getByRole('textbox', { name: 'Date de fin' }).fill('05/08/2027')
}
async function etape4(page) {
  await page.getByRole('textbox', { name: 'Instructions spécifiques' }).fill('Indiquez votre nom et « Centre » en référence du virement.')
}
const ETAPES = [etape1, etape2, etape3, etape4]

/** Remplit et valide les étapes 1 à n − 1, puis s'arrête sur l'étape n. */
const jusqua = n => async (page) => {
  for (let i = 0; i < n - 1; i++) {
    await ETAPES[i](page)
    await continuer(page)
  }
  if (n <= ETAPES.length) await ETAPES[n - 1](page)
  await page.mouse.click(1, 1) // referme un éventuel focus / infobulle
}

export default {
  '1': jusqua(1),
  '2': jusqua(2),
  '3': jusqua(3),
  '4': jusqua(4),
  '6': jusqua(5),
  'succes': async (page) => {
    await jusqua(5)(page)
    await page.getByRole('button', { name: 'Créer le projet' }).click()
    await page.getByText('Projet créé !').waitFor()
  },
  'erreurs-etape1': async (page) => {
    await continuer(page)
  },
  'quitter': async (page, { mobile }) => {
    await etape1(page)
    if (!mobile) await page.getByRole('button', { name: 'Quitter' }).click()
    else await page.getByRole('link', { name: 'Retour' }).click()
  },
}
