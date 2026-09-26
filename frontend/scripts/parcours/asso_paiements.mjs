// Parcours de /asso/paiements (MgPaiements).
export default {
  valides: async (page, { mobile }) => {
    if (mobile) await page.getByRole('radio', { name: 'Validés' }).click()
    else await page.getByRole('tab', { name: 'Validés' }).click()
    await page.waitForTimeout(400)
  },
  validation: async (page, { mobile }) => {
    if (mobile) await page.getByRole('button', { name: 'Valider le paiement de Awa Koné' }).click()
    else await page.keyboard.press('v')
    await page.waitForTimeout(1200)
  },
  annulation: async (page, { mobile }) => {
    if (mobile) await page.getByRole('button', { name: 'Valider le paiement de Awa Koné' }).click()
    else await page.getByRole('button', { name: 'Valider le paiement' }).click()
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: 'Annuler' }).first().click()
    await page.waitForTimeout(1200)
  },
}
