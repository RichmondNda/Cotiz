// DELETE /api/v1/associations/{aid}/team/{uid} — tm.team › remove (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { teamRemove } from '~~/server/mocks/handlers/association'

export default defineContractHandler('tm.team', 'remove', teamRemove)
