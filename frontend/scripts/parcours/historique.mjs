// Parcours de /historique (MbHistorique) : détail d'un paiement (feuille), puis sa preuve.
const premiereLigne = page => page.locator('.historique__ligne').first().click()

export default {
  'detail-ouvert': async (page) => {
    await premiereLigne(page)
    await page.getByRole('dialog', { name: 'Détail du paiement' }).waitFor()
  },
  // Preuve fichier lue par fl.get (lot 3.4) : le paiement le plus récent doit en porter une.
  'preuve-ouverte': async (page) => {
    await premiereLigne(page)
    await page.getByRole('button', { name: 'Voir la preuve' }).click()
    await page.getByRole('dialog', { name: 'Détail du paiement' }).getByRole('link', { name: /Télécharger/ }).waitFor()
    await page.waitForTimeout(300)
  },
}
