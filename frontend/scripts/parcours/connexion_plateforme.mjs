// Parcours de /connexion/plateforme (super-admin). Compte de seed-dev : server/mocks/IDENTIFIANTS.md ; erreur et
// second facteur imposés (scripts/reponses-imposees.mjs ; second facteur réel au lot 4.7).
import { COMPTES } from '../session-test.mjs'
import { imposerProbleme, imposerReponse } from '../reponses-imposees.mjs'

const LOGIN = '**/api/v1/auth/login'

async function saisir(page, motDePasse) {
  await page.getByLabel('Email').fill(COMPTES.superadmin.identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse)
}

async function soumettre(page) {
  const reponse = page.waitForResponse(LOGIN)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await reponse
}

export default {
  'nominal': page => saisir(page, COMPTES.superadmin.password),
  'erreur': async (page) => {
    await imposerProbleme(page, LOGIN, 'invalid_credentials')
    await saisir(page, 'mauvaismdp')
    await soumettre(page)
  },
  'code-verification': async (page) => {
    await imposerReponse(page, LOGIN, { status: 'mfa_required', mfaToken: 'mfa.capture', expiresAt: new Date(Date.now() + 300_000).toISOString() })
    await saisir(page, COMPTES.superadmin.password)
    await soumettre(page)
    // « Retour » s'affiche sous la souris restée sur « Se connecter » : pas d'état de survol dans la capture.
    await page.mouse.move(0, 0)
    await page.getByLabel('Chiffre 1').fill('481')
  },
}
