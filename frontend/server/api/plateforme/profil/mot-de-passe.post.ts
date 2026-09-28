// POST /api/plateforme/profil/mot-de-passe — change le mot de passe du super-admin.
// Mot de passe actuel des mocks : `motdepasse` (server/mocks/IDENTIFIANTS.md).
import { MOT_DE_PASSE } from '../../../mocks/auth'
import { store } from '../../../mocks/store'
import { motDePasseValide } from '../../../utils/mot-de-passe'

export default defineMockHandler(async (event) => {
  const { actuel, nouveau } = await readBody<{ actuel?: string, nouveau?: string }>(event) ?? {}
  if (actuel !== MOT_DE_PASSE) erreurMetier(400, 'mot-de-passe-incorrect', 'Wrong password')
  const mdp = String(nouveau ?? '')
  if (mdp.length < 8 || !/\d/.test(mdp) || !motDePasseValide(mdp)) erreurMetier(422, 'mot-de-passe-faible', 'Weak password')
  return store.profilPlateforme
})
