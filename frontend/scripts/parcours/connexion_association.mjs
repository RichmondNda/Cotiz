// Parcours de /connexion/association (gestionnaire). Compte de seed-dev : server/mocks/IDENTIFIANTS.md ; états
// d'erreur imposés (scripts/reponses-imposees.mjs), sans jamais bloquer le compte de développement.
import { COMPTES } from '../session-test.mjs'
import { imposerProbleme } from '../reponses-imposees.mjs'

const LOGIN = '**/api/v1/auth/login'

async function saisir(page, motDePasse) {
  await page.getByLabel('Email').fill(COMPTES.gestionnaire.identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse)
}

async function soumettre(page) {
  const reponse = page.waitForResponse(LOGIN)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await reponse
}

async function echec(page, code) {
  await imposerProbleme(page, LOGIN, code)
  await saisir(page, 'mauvaismdp')
  await soumettre(page)
}

export default {
  'nominal': page => saisir(page, COMPTES.gestionnaire.password),
  'identifiants-incorrects': page => echec(page, 'invalid_credentials'),
  'compte-suspendu': page => echec(page, 'association_suspended'),
  'blocage-15-min': page => echec(page, 'account_locked'),
  'chargement': async (page) => {
    await page.route(LOGIN, () => new Promise(() => {}))
    await saisir(page, COMPTES.gestionnaire.password)
    await page.getByRole('button', { name: 'Se connecter' }).click()
  },
}
