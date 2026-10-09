// GET /api/v1/platform/associations — pf.asso.list › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { associationsList } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.asso.list', 'list', associationsList)
