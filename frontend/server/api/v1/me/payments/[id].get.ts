// GET /api/v1/me/payments/{id} — me.payment › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { paymentGet } from '~~/server/mocks/handlers/subscriber'

export default defineContractHandler('me.payment', 'get', paymentGet)
