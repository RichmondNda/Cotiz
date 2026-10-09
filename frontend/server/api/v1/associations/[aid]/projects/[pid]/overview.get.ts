// GET /api/v1/associations/{aid}/projects/{pid}/overview — pr.overview › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { overview } from '~~/server/mocks/handlers/projects'

export default defineContractHandler('pr.overview', 'get', overview)
