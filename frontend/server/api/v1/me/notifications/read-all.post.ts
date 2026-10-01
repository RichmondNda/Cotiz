// POST /api/v1/me/notifications/read-all — nt.read › readAll (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { notificationsReadAll } from '~~/server/mocks/handlers/session'

export default defineContractHandler('nt.read', 'readAll', notificationsReadAll)
