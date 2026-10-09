// GET /api/v1/associations/{aid}/imports/{id}/rows — im.read › rows (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { importRows } from '~~/server/mocks/handlers/imports'

export default defineContractHandler('im.read', 'rows', importRows)
