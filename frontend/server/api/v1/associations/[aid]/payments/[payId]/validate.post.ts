// POST /api/v1/associations/{aid}/payments/{payId}/validate — lg.pay.validate › validate (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { paymentValidate } from '~~/server/mocks/handlers/ledger'

export default defineContractHandler('lg.pay.validate', 'validate', paymentValidate)
