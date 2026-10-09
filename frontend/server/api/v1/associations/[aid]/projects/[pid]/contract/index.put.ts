// PUT /api/v1/associations/{aid}/projects/{pid}/contract — ct.get › update (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { contractUpdate } from '~~/server/mocks/handlers/association'

export default defineContractHandler('ct.get', 'update', contractUpdate)
