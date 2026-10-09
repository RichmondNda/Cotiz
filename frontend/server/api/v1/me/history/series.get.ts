// GET /api/v1/me/history/series — me.history › series (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { historySeries } from '~~/server/mocks/handlers/subscriber'

export default defineContractHandler('me.history', 'series', historySeries)
