// Parcours de /asso/abonnement (MgAbonnement).
export default {
  'changement-demande': async (page, { mobile }) => {
    await page.getByRole('button', { name: mobile ? 'Demander un changement de formule' : 'Demander un changement' }).click()
    await page.waitForTimeout(1000)
  },
}
