// Parcours de /plateforme/demandes/tontine-commercantes-adjame (SaDemande).
export default {
  'modale-approbation': async (page) => {
    await page.getByRole('button', { name: 'Approuver et créer l’espace' }).click()
  },
  'modale-refus': async (page) => {
    await page.getByRole('button', { name: 'Refuser', exact: true }).click()
  },
  // Parcours complet : approbation confirmée → résumé « Approuvée » et association créée.
  'approbation-confirmee': async (page) => {
    await page.getByRole('button', { name: 'Approuver et créer l’espace' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Approuver et créer l’espace' }).click()
    await page.waitForTimeout(1000)
  },
}
