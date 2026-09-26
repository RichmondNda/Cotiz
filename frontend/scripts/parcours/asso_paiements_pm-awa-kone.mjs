// Parcours de /asso/paiements/pm-awa-kone (MgPaiement).
export default {
  'repartition-ajustee': async (page) => {
    await page.getByRole('button', { name: 'Ajuster' }).click()
    await page.getByRole('checkbox', { name: /Novembre 2026/ }).click()
    await page.waitForTimeout(200)
  },
  'modale-rejet': async (page) => {
    await page.getByRole('button', { name: 'Rejeter', exact: true }).click()
    await page.waitForTimeout(400)
  },
  'valide': async (page, { mobile }) => {
    if (mobile) {
      await page.getByRole('button', { name: 'Valider', exact: true }).click()
    }
    else {
      await page.getByRole('button', { name: 'Valider le paiement' }).click()
      await page.getByRole('button', { name: 'Oui, valider' }).click()
    }
    await page.waitForTimeout(1500)
  },
}
