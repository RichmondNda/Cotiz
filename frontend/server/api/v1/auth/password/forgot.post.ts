// POST /api/v1/auth/password/forgot — auth.forgot › forgot (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { forgot } from '~~/server/mocks/handlers/session'

export default defineContractHandler('auth.forgot', 'forgot', forgot)
