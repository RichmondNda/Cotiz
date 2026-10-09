// POST /api/v1/platform/associations — pf.asso.create › create (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { associationCreate } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.asso.create', 'create', associationCreate)
