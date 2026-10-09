// GET /api/v1/associations/{aid}/installments/{iid} — lg.inst › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { installmentGet } from '~~/server/mocks/handlers/ledger'

export default defineContractHandler('lg.inst', 'get', installmentGet)
