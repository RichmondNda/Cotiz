// GET /api/v1/me/profile — me.profile › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { profileGet } from '~~/server/mocks/handlers/session'

export default defineContractHandler('me.profile', 'get', profileGet)
