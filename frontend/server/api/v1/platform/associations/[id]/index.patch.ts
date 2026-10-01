// PATCH /api/v1/platform/associations/{id} — pf.asso.patch › patch (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { associationPatch } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.asso.patch', 'patch', associationPatch)
