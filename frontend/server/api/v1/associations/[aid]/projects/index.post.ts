// POST /api/v1/associations/{aid}/projects — pr.create › create (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { projectCreate } from '~~/server/mocks/handlers/projects'

export default defineContractHandler('pr.create', 'create', projectCreate)
