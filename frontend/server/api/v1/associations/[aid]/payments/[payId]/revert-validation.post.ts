// POST /api/v1/associations/{aid}/payments/{payId}/revert-validation — lg.pay.revert › revert (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { paymentRevert } from '~~/server/mocks/handlers/ledger'

export default defineContractHandler('lg.pay.revert', 'revert', paymentRevert)
