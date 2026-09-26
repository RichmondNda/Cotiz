// Parcours de /asso/projets/centre-communautaire/paiements (MgProjetPaiements).
const caseMoussaSeptembre = page => page.getByRole('button', { name: /Moussa Diarra — Septembre 2026/ }).first()

export default {
  'panneau-echeance': async (page) => {
    await caseMoussaSeptembre(page).click()
    await page.waitForTimeout(400)
  },
  'detail-echeance': async (page) => {
    await caseMoussaSeptembre(page).click()
    await page.waitForTimeout(400)
  },
  'examiner': async (page, { mobile }) => {
    if (mobile) await page.getByRole('button', { name: /Awa Koné — Septembre 2026/ }).first().click()
    else await page.getByRole('button', { name: 'Examiner le paiement de Awa Koné' }).click()
    await page.waitForTimeout(400)
  },
  'validation': async (page, { mobile }) => {
    if (mobile) await page.getByRole('button', { name: /Awa Koné — Septembre 2026/ }).first().click()
    else await page.getByRole('button', { name: 'Examiner le paiement de Awa Koné' }).click()
    await page.getByRole('button', { name: 'Valider le paiement' }).click()
    await page.waitForTimeout(1200)
  },
}
