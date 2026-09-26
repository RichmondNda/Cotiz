// POST /api/session/code — second facteur de l'espace plateforme (V2 dans la spec). Code valide : 481902.
import type { ResultatConnexion } from '~~/types'
import { CODE_PLATEFORME } from '../../mocks/auth'

export default defineMockHandler(async (event): Promise<ResultatConnexion> => {
  const { code } = await readBody<{ code?: string }>(event) ?? {}
  if (String(code ?? '').replace(/\D/g, '') !== CODE_PLATEFORME) erreurMetier(401, 'code-incorrect', 'Code incorrect')
  return { etape: 'connecte', role: 'superadmin' }
})
