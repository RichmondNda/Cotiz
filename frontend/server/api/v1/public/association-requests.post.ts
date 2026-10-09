// POST /api/v1/public/association-requests — pub.request › create (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { requestCreate } from '~~/server/mocks/handlers/public'

export default defineContractHandler('pub.request', 'create', requestCreate)
