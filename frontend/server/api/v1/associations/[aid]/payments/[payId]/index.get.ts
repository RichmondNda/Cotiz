// GET /api/v1/associations/{aid}/payments/{payId} — lg.pay.get › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { paymentGet } from '~~/server/mocks/handlers/ledger'

export default defineContractHandler('lg.pay.get', 'get', paymentGet)
