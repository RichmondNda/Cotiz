// GET /api/v1/platform/dashboard — pf.dashboard › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { dashboard } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.dashboard', 'get', dashboard)
