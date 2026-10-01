// DELETE /api/v1/associations/{aid}/projects/{pid} — pr.delete › remove (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { projectDelete } from '~~/server/mocks/handlers/projects'

export default defineContractHandler('pr.delete', 'remove', projectDelete)
