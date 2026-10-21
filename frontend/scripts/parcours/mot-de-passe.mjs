// Parcours de /mot-de-passe. Demande de code sur le vrai back (réponse identique que le compte existe ou non) ;
// vérification du code et enregistrement imposés (scripts/reponses-imposees.mjs) : le code réel n'est remis que par
// une personne.
import { imposerProbleme, imposerReponse } from '../reponses-imposees.mjs'

const VERIFY = '**/api/v1/auth/password/verify-code'
const RESET = '**/api/v1/auth/password/reset'

async function demanderCode(page) {
  await page.getByLabel('Téléphone').fill('0544218790')
  const reponse = page.waitForResponse('**/api/v1/auth/password/forgot')
  await page.getByRole('button', { name: 'Recevoir un code' }).click()
  await reponse
}

async function verifier(page, code) {
  await page.getByLabel('Chiffre 1').fill(code)
  const reponse = page.waitForResponse(VERIFY)
  await page.getByRole('button', { name: 'Vérifier le code' }).click()
  await reponse
}

const codeValide = page => imposerReponse(page, VERIFY, { resetToken: 'reset.capture', expiresAt: new Date(Date.now() + 600_000).toISOString() })

export default {
  'navigable': page => page.getByLabel('Téléphone').fill('0544218790'),
  'code-incorrect': async (page) => {
    await imposerProbleme(page, VERIFY, 'invalid_code')
    await demanderCode(page)
    await verifier(page, '481902')
  },
  'code-expire': async (page) => {
    await imposerProbleme(page, VERIFY, 'code_expired')
    await demanderCode(page)
    await verifier(page, '000000')
  },
  'nouveau-mot-de-passe': async (page) => {
    await codeValide(page)
    await demanderCode(page)
    await verifier(page, '123456')
    await page.getByLabel('Nouveau mot de passe').fill('Cotiz2026')
    await page.getByLabel('Confirmer le mot de passe').fill('Cotiz2026')
  },
  'succes': async (page) => {
    await codeValide(page)
    await imposerReponse(page, RESET, null, 204)
    await demanderCode(page)
    await verifier(page, '123456')
    await page.getByLabel('Nouveau mot de passe').fill('Cotiz2026')
    await page.getByLabel('Confirmer le mot de passe').fill('Cotiz2026')
    const reponse = page.waitForResponse(RESET)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await reponse
    // Réponse imposée instantanée : attendre la fin du tracé de la coche avant la capture.
    await page.getByRole('heading', { name: 'Mot de passe modifié' }).waitFor()
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'))
  },
}
