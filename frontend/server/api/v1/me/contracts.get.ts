// GET /api/v1/me/contracts — me.contracts › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { contractsList } from '~~/server/mocks/handlers/subscriber'

export default defineContractHandler('me.contracts', 'list', contractsList)
