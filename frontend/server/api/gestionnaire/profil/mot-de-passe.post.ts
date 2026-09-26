// POST /api/gestionnaire/profil/mot-de-passe — change le mot de passe du gestionnaire connecté.
// Mot de passe actuel des mocks : `motdepasse` (server/mocks/IDENTIFIANTS.md).
import type { ProfilGestionnaire } from '~~/types'
import { MOT_DE_PASSE } from '../../../mocks/auth'
import { DATE_REFERENCE } from '../../../../app/utils/date-reference'
import { motDePasseValide } from '../../../utils/mot-de-passe'
import { complementProfil, gestionnaireConnecte, profilGestionnaire } from '../../../utils/profil-gestionnaire'

export default defineMockHandler(async (event): Promise<ProfilGestionnaire> => {
  const g = gestionnaireConnecte(event)
  const { actuel, nouveau } = await readBody<{ actuel?: string, nouveau?: string }>(event) ?? {}
  if (actuel !== MOT_DE_PASSE) erreurMetier(400, 'mot-de-passe-incorrect', 'Wrong password')
  const mdp = String(nouveau ?? '')
  if (mdp.length < 8 || !/\d/.test(mdp) || !motDePasseValide(mdp)) erreurMetier(422, 'mot-de-passe-faible', 'Weak password')
  complementProfil(g.id).motDePasseModifieLe = DATE_REFERENCE.slice(0, 10)
  return profilGestionnaire(g)
})
