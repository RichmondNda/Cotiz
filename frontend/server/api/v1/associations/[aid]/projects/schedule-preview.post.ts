// POST /api/v1/associations/{aid}/projects/schedule-preview — pr.preview › preview (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { preview } from '~~/server/mocks/handlers/projects'

export default defineContractHandler('pr.preview', 'preview', preview)
