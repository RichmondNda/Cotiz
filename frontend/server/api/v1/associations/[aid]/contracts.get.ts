// GET /api/v1/associations/{aid}/contracts — ct.list › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { contractsList } from '~~/server/mocks/handlers/association'

export default defineContractHandler('ct.list', 'list', contractsList)
