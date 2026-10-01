// POST /api/v1/auth/logout — auth.logout › logout (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { logout } from '~~/server/mocks/handlers/session'

export default defineContractHandler('auth.logout', 'logout', logout)
