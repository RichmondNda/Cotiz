// PATCH /api/v1/associations/{aid}/members/{uid} — mb.patch › patch (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { memberPatch } from '~~/server/mocks/handlers/members'

export default defineContractHandler('mb.patch', 'patch', memberPatch)
