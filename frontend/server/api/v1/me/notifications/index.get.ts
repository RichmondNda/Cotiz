// GET /api/v1/me/notifications — nt.list › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { notificationsList } from '~~/server/mocks/handlers/session'

export default defineContractHandler('nt.list', 'list', notificationsList)
