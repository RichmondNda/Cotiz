// PUT /api/v1/me/notification-preferences — me.prefs › replace (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { prefsReplace } from '~~/server/mocks/handlers/session'

export default defineContractHandler('me.prefs', 'replace', prefsReplace)
