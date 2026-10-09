// POST /api/v1/platform/association-requests/{id}/reject — pf.req.reject › reject (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { requestReject } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.req.reject', 'reject', requestReject)
