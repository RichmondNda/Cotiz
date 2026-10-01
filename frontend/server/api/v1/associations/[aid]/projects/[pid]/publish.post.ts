// POST /api/v1/associations/{aid}/projects/{pid}/publish — pr.lifecycle › publish (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { projectPublish } from '~~/server/mocks/handlers/projects'

export default defineContractHandler('pr.lifecycle', 'publish', projectPublish)
