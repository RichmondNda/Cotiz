// GET /api/v1/me/projects/{pid}/contract — me.contract › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { contractGet } from '~~/server/mocks/handlers/subscriber'

export default defineContractHandler('me.contract', 'get', contractGet)
