// GET /api/v1/me/associations — me.assos › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { associationsList } from '~~/server/mocks/handlers/subscriber'

export default defineContractHandler('me.assos', 'list', associationsList)
