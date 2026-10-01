// PATCH /api/v1/me/profile — me.profile › patch (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { profilePatch } from '~~/server/mocks/handlers/session'

export default defineContractHandler('me.profile', 'patch', profilePatch)
