// PATCH /api/v1/associations/{aid}/imports/{id}/rows/{rowId} — im.steps › row (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { importRow } from '~~/server/mocks/handlers/imports'

export default defineContractHandler('im.steps', 'row', importRow)
