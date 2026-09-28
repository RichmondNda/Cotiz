// Parcours de /plateforme/demandes (SaDemandes).
export default {
  'recherche-sans-resultat': async (page) => {
    await page.getByRole('searchbox', { name: 'Rechercher une demande' }).fill('Kouadio')
  },
}
