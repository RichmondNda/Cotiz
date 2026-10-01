// GET /api/v1/me/history — me.history › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { history } from '~~/server/mocks/handlers/subscriber'

export default defineContractHandler('me.history', 'list', history)
