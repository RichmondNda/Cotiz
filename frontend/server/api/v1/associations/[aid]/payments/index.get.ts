// GET /api/v1/associations/{aid}/payments — lg.pay.list › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { paymentsList } from '~~/server/mocks/handlers/ledger'

export default defineContractHandler('lg.pay.list', 'list', paymentsList)
