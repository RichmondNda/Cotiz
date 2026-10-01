// GET /api/v1/me — me › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { me } from '~~/server/mocks/handlers/session'

export default defineContractHandler('me', 'get', me)
