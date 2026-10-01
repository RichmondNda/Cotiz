// POST /api/v1/associations/{aid}/payments/{payId}/reject — lg.pay.reject › reject (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { paymentReject } from '~~/server/mocks/handlers/ledger'

export default defineContractHandler('lg.pay.reject', 'reject', paymentReject)
