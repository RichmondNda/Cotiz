// POST /api/v1/auth/activate — auth.activate › activate (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { activate } from '~~/server/mocks/handlers/session'

export default defineContractHandler('auth.activate', 'activate', activate)
