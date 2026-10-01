// GET /api/v1/associations/{aid}/members/{uid} — mb.get › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { memberGet } from '~~/server/mocks/handlers/members'

export default defineContractHandler('mb.get', 'get', memberGet)
