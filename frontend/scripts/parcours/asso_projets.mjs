// Parcours de /asso/projets (MgProjets) : vue tableau avec le menu ⋯ ouvert (contrôle, pas d'état d'inventaire).
export default {
  'menu-tableau': async (page, { mobile }) => {
    if (mobile) return
    await page.getByRole('radio', { name: 'Tableau' }).click()
    await page.getByRole('button', { name: 'Actions sur Centre communautaire' }).click()
  },
}
