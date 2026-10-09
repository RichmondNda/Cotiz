// PATCH /api/v1/associations/{aid} — as.patch › patch (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { associationPatch } from '~~/server/mocks/handlers/association'

export default defineContractHandler('as.patch', 'patch', associationPatch)
