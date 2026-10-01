// GET /api/v1/me/notifications/unread-count — nt.list › unreadCount (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { unreadCount } from '~~/server/mocks/handlers/session'

export default defineContractHandler('nt.list', 'unreadCount', unreadCount)
