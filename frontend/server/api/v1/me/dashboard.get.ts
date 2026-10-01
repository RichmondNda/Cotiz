// GET /api/v1/me/dashboard — me.dash › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { dashboard } from '~~/server/mocks/handlers/subscriber'

export default defineContractHandler('me.dash', 'get', dashboard)
