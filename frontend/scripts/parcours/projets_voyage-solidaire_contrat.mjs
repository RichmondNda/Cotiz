// Parcours de /projets/voyage-solidaire/contrat (MbContrat). Le store est réinitialisé avant chaque rendu.

async function cocher(page) {
  await page.getByText('J’ai lu et j’accepte les termes du contrat.').click()
}

export default {
  'lecture': async () => {},
  'case-cochee': cocher,
  'signe': async (page) => {
    await cocher(page)
    await page.getByRole('button', { name: 'Signer le contrat' }).click()
    await page.getByRole('heading', { name: 'Contrat signé !' }).waitFor()
  },
}
