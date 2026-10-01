// GET /api/v1/associations/{aid}/projects/{pid} — pr.get › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { projectGet } from '~~/server/mocks/handlers/projects'

export default defineContractHandler('pr.get', 'get', projectGet)
