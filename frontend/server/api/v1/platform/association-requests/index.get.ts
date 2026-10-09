// GET /api/v1/platform/association-requests — pf.req.list › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { requestsList } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.req.list', 'list', requestsList)
