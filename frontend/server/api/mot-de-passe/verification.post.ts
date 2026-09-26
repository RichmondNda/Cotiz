// POST /api/mot-de-passe/verification — vérifie le code reçu. 123456 valide, 000000 expiré, autre incorrect.
import { CODE_SMS_EXPIRE, CODE_SMS_VALIDE } from '../../mocks/auth'

export default defineMockHandler(async (event) => {
  const { code } = await readBody<{ code?: string }>(event) ?? {}
  const c = String(code ?? '').replace(/\D/g, '')
  if (c === CODE_SMS_EXPIRE) erreurMetier(410, 'code-expire', 'Code expire')
  if (c !== CODE_SMS_VALIDE) erreurMetier(400, 'code-incorrect', 'Code incorrect')
  return { ok: true as const }
})
