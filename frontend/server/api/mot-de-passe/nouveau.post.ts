// POST /api/mot-de-passe/nouveau — enregistre le nouveau mot de passe après vérification du code.
import { motDePasseValide } from '../../utils/mot-de-passe'

export default defineMockHandler(async (event) => {
  const { motDePasse } = await readBody<{ motDePasse?: string }>(event) ?? {}
  if (!motDePasseValide(String(motDePasse ?? ''))) {
    throw createError({ statusCode: 400, statusMessage: 'Mot de passe trop faible' })
  }
  return { ok: true as const }
})
