// GET /api/v1/associations/{aid}/team — tm.team › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { teamList } from '~~/server/mocks/handlers/association'

export default defineContractHandler('tm.team', 'list', teamList)
