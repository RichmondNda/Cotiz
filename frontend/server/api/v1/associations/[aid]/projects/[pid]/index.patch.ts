// PATCH /api/v1/associations/{aid}/projects/{pid} — pr.patch › patch (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { projectPatch } from '~~/server/mocks/handlers/projects'

export default defineContractHandler('pr.patch', 'patch', projectPatch)
