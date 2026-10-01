// GET /api/v1/platform/associations/{id} — pf.asso.get › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { associationGet } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.asso.get', 'get', associationGet)
