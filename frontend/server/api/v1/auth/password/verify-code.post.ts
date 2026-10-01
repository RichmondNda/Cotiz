// POST /api/v1/auth/password/verify-code — auth.verify › verify (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { verify } from '~~/server/mocks/handlers/session'

export default defineContractHandler('auth.verify', 'verify', verify)
