// GET /api/v1/associations/{aid} — as.get › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { associationGet } from '~~/server/mocks/handlers/association'

export default defineContractHandler('as.get', 'get', associationGet)
