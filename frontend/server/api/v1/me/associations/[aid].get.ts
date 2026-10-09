// GET /api/v1/me/associations/{aid} — me.assos › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { associationGet } from '~~/server/mocks/handlers/subscriber'

export default defineContractHandler('me.assos', 'get', associationGet)
