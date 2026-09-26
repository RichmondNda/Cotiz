// POST /api/session/mot-de-passe — première connexion : remplace le mot de passe provisoire.
import type { ResultatConnexion } from '~~/types'
import { motDePasseValide } from '../../utils/mot-de-passe'

export default defineMockHandler(async (event): Promise<ResultatConnexion> => {
  const { motDePasse } = await readBody<{ motDePasse?: string }>(event) ?? {}
  if (!motDePasseValide(String(motDePasse ?? ''))) {
    throw createError({ statusCode: 400, statusMessage: 'Mot de passe trop faible' })
  }
  return { etape: 'connecte', role: 'souscripteur' }
})
