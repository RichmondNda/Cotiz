// GET /api/v1/platform/association-requests/{id} — pf.req.get › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { requestGet } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.req.get', 'get', requestGet)
