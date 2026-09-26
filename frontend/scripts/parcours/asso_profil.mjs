// Parcours de /asso/profil (MgProfil). Mot de passe actuel des mocks : `motdepasse`.
const ouvrir = async (page) => {
  await page.getByRole('button', { name: 'Modifier' }).click()
  await page.getByLabel('Mot de passe actuel').fill('motdepasse')
  await page.getByLabel('Nouveau mot de passe').fill('nouveaumotdepasse1')
  await page.getByLabel('Confirmer').fill('nouveaumotdepasse1')
}
export default {
  'changement-mot-de-passe': ouvrir,
  'mot-de-passe-modifie': async (page) => {
    await ouvrir(page)
    await page.getByRole('button', { name: /Changer/ }).filter({ visible: true }).click()
    await page.waitForTimeout(1000)
  },
}
