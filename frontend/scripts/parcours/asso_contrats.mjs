// Parcours de /asso/contrats (MgContrats).
export default {
  'detail-ouvert': async (page) => {
    await page.getByRole('button', { name: 'Voir le contrat Voyage solidaire' }).click()
    await page.waitForTimeout(500)
  },
}
