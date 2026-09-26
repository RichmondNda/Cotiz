// Parcours de /connexion/plateforme (super-admin). Identifiants : server/mocks/IDENTIFIANTS.md.

async function saisir(page, motDePasse) {
  await page.getByLabel('Email').fill('richy@cotiz.app')
  await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse)
}

async function soumettre(page) {
  const reponse = page.waitForResponse('**/api/session/connexion')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await reponse
}

export default {
  'nominal': page => saisir(page, 'motdepasse'),
  'erreur': async (page) => {
    await saisir(page, 'mauvaismdp')
    await soumettre(page)
  },
  'code-verification': async (page) => {
    await saisir(page, 'motdepasse')
    await soumettre(page)
    await page.getByLabel('Chiffre 1').fill('481')
  },
}
