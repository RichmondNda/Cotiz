// GET /api/v1/associations/{aid}/dashboard — as.dashboard › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { dashboard } from '~~/server/mocks/handlers/association'

export default defineContractHandler('as.dashboard', 'get', dashboard)
