// PATCH /api/v1/associations/{aid}/team/{uid} — tm.team › patch (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { teamPatch } from '~~/server/mocks/handlers/association'

export default defineContractHandler('tm.team', 'patch', teamPatch)
