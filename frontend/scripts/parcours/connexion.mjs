// Parcours de /connexion (souscripteur). Identifiants : server/mocks/IDENTIFIANTS.md.

async function saisir(page, telephone, motDePasse) {
  await page.getByLabel('Téléphone').fill(telephone)
  await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse)
}

async function soumettre(page) {
  await page.getByRole('button', { name: 'Me connecter' }).click()
  await page.waitForResponse('**/api/session/connexion')
}

export default {
  'nominal': page => saisir(page, '0544218790', 'motdepasse'),
  'numero-inconnu': async (page) => {
    await saisir(page, '0700000000', 'motdepasse')
    await soumettre(page)
  },
  'mot-de-passe-incorrect': async (page) => {
    await saisir(page, '0544218790', 'mauvaismdp')
    await soumettre(page)
  },
  'premiere-connexion': async (page) => {
    await saisir(page, '0544218790', 'provisoire')
    await soumettre(page)
    await page.getByLabel('Nouveau mot de passe').fill('cotiz2026')
    await page.getByLabel('Confirmer le mot de passe').fill('cotiz2026')
  },
}
