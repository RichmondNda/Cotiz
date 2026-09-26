// Parcours de /asso/parametres (MgParametres).
const modifier = async (page) => {
  const champ = page.getByLabel('Ville')
  await champ.fill('Abidjan ')
  await champ.fill('Abidjan')
  await page.getByLabel('Opérateur').fill('[Opérateur] ')
  await page.waitForTimeout(300)
}
export default {
  'modifications-non-enregistrees': modifier,
  // Garde de navigation : quitter la page avec des modifications ouvre la confirmation.
  'quitter-sans-enregistrer': async (page, { mobile }) => {
    await modifier(page)
    if (mobile) await page.getByRole('link', { name: 'Retour' }).click()
    else await page.getByRole('link', { name: 'Projets' }).first().click()
    await page.waitForTimeout(600)
  },
  'enregistre': async (page) => {
    await modifier(page)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await page.waitForTimeout(1200)
  },
}
