// GET /api/v1/associations/{aid}/subscription — bl.sub › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { subscription } from '~~/server/mocks/handlers/association'

export default defineContractHandler('bl.sub', 'get', subscription)
