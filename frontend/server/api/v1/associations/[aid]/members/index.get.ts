// GET /api/v1/associations/{aid}/members — mb.list › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { membersList } from '~~/server/mocks/handlers/members'

export default defineContractHandler('mb.list', 'list', membersList)
