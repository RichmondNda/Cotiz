// GET /api/v1/associations/{aid}/projects/{pid}/grid — lg.grid › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { grid } from '~~/server/mocks/handlers/ledger'

export default defineContractHandler('lg.grid', 'get', grid)
