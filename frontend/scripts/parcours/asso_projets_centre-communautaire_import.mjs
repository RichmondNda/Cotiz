// Parcours de /asso/projets/centre-communautaire/import (MgImport). Lot 4.4 : un vrai fichier CSV est déposé, lu par le
// worker ; l'écran relit l'import toutes les 2 s. Fichier proche de la maquette : lignes prêtes, deux erreurs (prénom
// manquant, téléphone incomplet), un doublon de la ligne 2. Numéros neufs à chaque passage (l'envoi inscrit réellement :
// un second passage avec les mêmes numéros ne trouverait que des personnes déjà inscrites).
// Le web et le mobile passent dans le même processus : numéros tirés à chaque dépôt, pas au chargement du module.
let tirage = 0
const lignes = () => {
  const base = (Math.floor(Date.now() / 1000) + 100 * tirage++) % 90_000_000
  const tel = n => `07${String(base + n).padStart(8, '0')}`
  return [
    'Prénom;NOM;Tel;Mail;Quartier',
    `Aïcha;Bamba;${tel(0)};aicha@exemple.ci;Yopougon`,
    ...Array.from({ length: 46 }, (_, i) => `Membre${i + 1};Entraide;${tel(i + 1)};;Abobo`),
    ';Coulibaly;0102030405;;Cocody',
    'Yao;Kouamé;07 12 34;;Abobo',
    `Aïcha;Bamba;+225 ${tel(0)};;Yopougon`,
  ]
}
const deposer = async (page) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'membres_entraide.csv', mimeType: 'text/csv', buffer: Buffer.from(lignes().join('\n'), 'utf8'),
  })
  await page.getByText(/\d+ lignes/).locator('visible=true').first().waitFor({ timeout: 30_000 })
}
const continuer = async (page) => {
  await page.getByRole('button', { name: 'Continuer', exact: true }).locator('visible=true').click()
  await page.waitForTimeout(500)
}
const jusqua = async (page, etape) => {
  await deposer(page)
  for (let i = 1; i < etape; i++) await continuer(page)
}

export default {
  '1-fichier': async (page, { mobile }) => {
    if (mobile) await deposer(page)
  },
  'fichier-invalide': async (page) => {
    await page.locator('input[type="file"]').setInputFiles({ name: 'membres.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
    await page.waitForTimeout(300)
  },
  '2-colonnes': async page => jusqua(page, 2),
  '3-verification': async page => jusqua(page, 3),
  '4-envoi': async page => jusqua(page, 4),
  'import-termine': async (page, { mobile }) => {
    await jusqua(page, 4)
    await page.getByRole('button', { name: mobile ? 'Lancer l’import' : /^Importer \d+ souscripteurs$/ }).locator('visible=true').click()
    await page.getByText('Import terminé').locator('visible=true').first().waitFor({ timeout: 60_000 })
  },
}
