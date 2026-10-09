// PATCH /api/v1/associations/{aid}/imports/{id}/mapping — im.steps › mapping (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { importMapping } from '~~/server/mocks/handlers/imports'

export default defineContractHandler('im.steps', 'mapping', importMapping)
