// POST /api/v1/me/payments — me.declare › declare (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { declare } from '~~/server/mocks/handlers/subscriber'

export default defineContractHandler('me.declare', 'declare', declare)
