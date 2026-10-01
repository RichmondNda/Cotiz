// GET /api/v1/me/notification-preferences — me.prefs › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { prefsGet } from '~~/server/mocks/handlers/session'

export default defineContractHandler('me.prefs', 'get', prefsGet)
