// POST /api/v1/me/projects/{pid}/contract/sign — me.sign › sign (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { contractSign } from '~~/server/mocks/handlers/subscriber'

export default defineContractHandler('me.sign', 'sign', contractSign)
