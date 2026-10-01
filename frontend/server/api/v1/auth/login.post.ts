// POST /api/v1/auth/login — auth.login › login (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { login } from '~~/server/mocks/handlers/session'

export default defineContractHandler('auth.login', 'login', login)
