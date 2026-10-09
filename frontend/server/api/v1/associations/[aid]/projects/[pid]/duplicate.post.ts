// POST /api/v1/associations/{aid}/projects/{pid}/duplicate — pr.lifecycle › duplicate (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { projectDuplicate } from '~~/server/mocks/handlers/projects'

export default defineContractHandler('pr.lifecycle', 'duplicate', projectDuplicate)
