// POST /api/v1/me/notifications/{id}/read — nt.read › read (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { notificationRead } from '~~/server/mocks/handlers/session'

export default defineContractHandler('nt.read', 'read', notificationRead)
