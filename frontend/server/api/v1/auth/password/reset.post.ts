// POST /api/v1/auth/password/reset — auth.reset › reset (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { reset } from '~~/server/mocks/handlers/session'

export default defineContractHandler('auth.reset', 'reset', reset)
