// POST /api/v1/associations/{aid}/projects/{pid}/close — pr.lifecycle › close (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { projectClose } from '~~/server/mocks/handlers/projects'

export default defineContractHandler('pr.lifecycle', 'close', projectClose)
