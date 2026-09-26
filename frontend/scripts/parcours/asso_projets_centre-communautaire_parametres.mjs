// Parcours de /asso/projets/centre-communautaire/parametres (MgProjetParametres).
export default {
  'enregistre': async (page, { mobile }) => {
    await page.getByRole('button', { name: mobile ? 'Enregistrer' : 'Enregistrer les modifications', exact: true }).click()
    await page.waitForTimeout(900)
  },
  'confirmation-cloture': async (page, { mobile }) => {
    await page.getByRole('button', { name: mobile ? 'Clôturer le projet' : 'Clôturer', exact: true }).click()
    await page.waitForTimeout(500)
  },
}
