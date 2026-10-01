// POST /api/v1/platform/association-requests/{id}/approve — pf.req.approve › approve (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { requestApprove } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.req.approve', 'approve', requestApprove)
