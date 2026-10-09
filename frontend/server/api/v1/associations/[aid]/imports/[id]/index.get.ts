// GET /api/v1/associations/{aid}/imports/{id} — im.read › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { importGet } from '~~/server/mocks/handlers/imports'

export default defineContractHandler('im.read', 'get', importGet)
