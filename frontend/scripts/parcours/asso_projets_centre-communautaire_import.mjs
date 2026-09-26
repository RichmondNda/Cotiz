// Parcours de /asso/projets/centre-communautaire/import (MgImport). V0 : un clic sur la zone simule le dépôt.
const deposer = async (page) => {
  await page.getByRole('button', { name: /Glissez votre fichier ici/ }).click()
  await page.waitForTimeout(700)
}
const continuer = async (page) => {
  await page.getByRole('button', { name: 'Continuer', exact: true }).locator('visible=true').click()
  await page.waitForTimeout(300)
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
    await page.waitForTimeout(1200)
  },
}
