// GET /api/v1/associations/{aid}/projects/{pid}/contract — ct.get › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { contractGet } from '~~/server/mocks/handlers/association'

export default defineContractHandler('ct.get', 'get', contractGet)
