// Parcours de /asso/projets/tontine-solidaire-2027/parametres : projet sans paiement, suppression possible.
const ouvrir = async (page) => {
  await page.getByRole('button', { name: 'Supprimer', exact: true }).locator('visible=true').click()
  await page.waitForTimeout(400)
}
export default {
  suppression: async (page) => {
    await ouvrir(page)
    await page.getByRole('textbox', { name: 'Saisissez le nom du projet pour confirmer' }).fill('Tontine solidaire 2027')
  },
  supprime: async (page) => {
    await ouvrir(page)
    await page.getByRole('textbox', { name: 'Saisissez le nom du projet pour confirmer' }).fill('Tontine solidaire 2027')
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click()
    await page.waitForTimeout(1500)
  },
}
