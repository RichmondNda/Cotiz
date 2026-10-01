// GET /api/v1/associations/{aid}/projects — pr.list › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { projectsList } from '~~/server/mocks/handlers/projects'

export default defineContractHandler('pr.list', 'list', projectsList)
