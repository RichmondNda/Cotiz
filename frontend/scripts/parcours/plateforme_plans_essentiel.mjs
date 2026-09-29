// Parcours de /plateforme/plans/essentiel (SaPlan).
export default {
  // Toute modification d'un plan qui a des abonnés affiche l'avertissement (ici : + puis − sur un quota).
  'avertissement-abonnes': async (page) => {
    const quota = page.getByRole('group', { name: 'Souscripteurs' })
    await quota.getByRole('button', { name: 'Augmenter' }).click()
    await quota.getByRole('button', { name: 'Diminuer' }).click()
  },
}
