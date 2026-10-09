// Parcours de /mot-de-passe. Codes mockés : 123456 valide, 000000 expiré, autre incorrect (server/mocks/IDENTIFIANTS.md).

async function demanderCode(page) {
  await page.getByLabel('Téléphone').fill('0544218790')
  const reponse = page.waitForResponse('**/api/v1/auth/password/forgot')
  await page.getByRole('button', { name: 'Recevoir un code' }).click()
  await reponse
}

async function verifier(page, code) {
  await page.getByLabel('Chiffre 1').fill(code)
  const reponse = page.waitForResponse('**/api/v1/auth/password/verify-code')
  await page.getByRole('button', { name: 'Vérifier le code' }).click()
  await reponse
}

export default {
  'navigable': page => page.getByLabel('Téléphone').fill('0544218790'),
  'code-incorrect': async (page) => {
    await demanderCode(page)
    await verifier(page, '481902')
  },
  'code-expire': async (page) => {
    await demanderCode(page)
    await verifier(page, '000000')
  },
  'nouveau-mot-de-passe': async (page) => {
    await demanderCode(page)
    await verifier(page, '123456')
    await page.getByLabel('Nouveau mot de passe').fill('Cotiz2026')
    await page.getByLabel('Confirmer le mot de passe').fill('Cotiz2026')
  },
  'succes': async (page) => {
    await demanderCode(page)
    await verifier(page, '123456')
    await page.getByLabel('Nouveau mot de passe').fill('Cotiz2026')
    await page.getByLabel('Confirmer le mot de passe').fill('Cotiz2026')
    const reponse = page.waitForResponse('**/api/v1/auth/password/reset')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await reponse
  },
}
