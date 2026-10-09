// Parcours de /connexion/association (gestionnaire). Identifiants : server/mocks/IDENTIFIANTS.md.
// ⚠ `blocage-15-min` bloque awa@entraide.ci 15 min dans le serveur de dev : le capturer en dernier
// (ou redémarrer `npm run dev` ensuite).

async function saisir(page, motDePasse) {
  await page.getByLabel('Email').fill('awa@entraide.ci')
  await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse)
}

async function soumettre(page) {
  const reponse = page.waitForResponse('**/api/v1/auth/login')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await reponse
}

export default {
  'nominal': page => saisir(page, 'motdepasse'),
  'identifiants-incorrects': async (page) => {
    await saisir(page, 'mauvaismdp')
    await soumettre(page)
  },
  'compte-suspendu': async (page) => {
    await saisir(page, 'suspendu')
    await soumettre(page)
  },
  'blocage-15-min': async (page) => {
    await saisir(page, 'mauvaismdp')
    for (let i = 0; i < 5; i++) await soumettre(page)
  },
  'chargement': async (page) => {
    await page.route('**/api/v1/auth/login', () => new Promise(() => {}))
    await saisir(page, 'motdepasse')
    await page.getByRole('button', { name: 'Se connecter' }).click()
  },
}
