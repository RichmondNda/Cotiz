// Parcours de /asso/projets/centre-communautaire/import (MgImport). Lot 4.4 : un vrai fichier CSV est déposé, lu par le
// worker ; l'écran relit l'import toutes les 2 s. Fichier proche de la maquette : lignes prêtes, deux erreurs (prénom
// manquant, téléphone incomplet), un doublon de la ligne 2.
const LIGNES = [
  'Prénom;NOM;Tel;Mail;Quartier',
  'Aïcha;Bamba;0712345678;aicha@exemple.ci;Yopougon',
  ...Array.from({ length: 46 }, (_, i) => `Membre${i + 1};Entraide;070${String(9000000 + i)};;Abobo`),
  ';Coulibaly;0102030405;;Cocody',
  'Yao;Kouamé;07 12 34;;Abobo',
  'Aïcha;Bamba;+225 07 12 34 56 78;;Yopougon',
]
const deposer = async (page) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'membres_entraide.csv', mimeType: 'text/csv', buffer: Buffer.from(LIGNES.join('\n'), 'utf8'),
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
