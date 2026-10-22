// Parcours de /connexion (souscripteur). Compte de seed-dev : server/mocks/IDENTIFIANTS.md ; états d'erreur imposés
// (scripts/reponses-imposees.mjs).
import { COMPTES } from '../session-test.mjs'
import { imposerProbleme } from '../reponses-imposees.mjs'

const LOGIN = '**/api/v1/auth/login'

async function saisir(page, telephone, motDePasse) {
  await page.getByLabel('Téléphone').fill(telephone)
  await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse)
}

async function soumettre(page) {
  const reponse = page.waitForResponse(LOGIN)
  await page.getByRole('button', { name: 'Me connecter' }).click()
  await reponse
}

export default {
  'nominal': page => saisir(page, COMPTES.souscripteur.identifiant, COMPTES.souscripteur.password),
  // Identifiant inconnu : le vrai back répond comme pour un mauvais mot de passe (aucune fuite d'existence).
  'numero-inconnu': async (page) => {
    await saisir(page, '0700000000', 'motdepasse')
    await soumettre(page)
  },
  'mot-de-passe-incorrect': async (page) => {
    await imposerProbleme(page, LOGIN, 'invalid_credentials')
    await saisir(page, COMPTES.souscripteur.identifiant, 'mauvaismdp')
    await soumettre(page)
  },
  'premiere-connexion': async (page) => {
    await imposerProbleme(page, LOGIN, 'account_not_activated')
    await saisir(page, COMPTES.souscripteur.identifiant, 'provisoire')
    await soumettre(page)
    await page.getByLabel('Nouveau mot de passe').fill('cotiz2026')
    await page.getByLabel('Confirmer le mot de passe').fill('cotiz2026')
  },
}
