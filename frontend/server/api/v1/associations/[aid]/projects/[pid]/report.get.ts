// GET /api/v1/associations/{aid}/projects/{pid}/report — rp.report › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { report } from '~~/server/mocks/handlers/projects'

export default defineContractHandler('rp.report', 'get', report)
