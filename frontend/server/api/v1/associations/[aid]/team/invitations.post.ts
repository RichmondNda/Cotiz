// POST /api/v1/associations/{aid}/team/invitations — tm.team › invite (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { teamInvite } from '~~/server/mocks/handlers/association'

export default defineContractHandler('tm.team', 'invite', teamInvite)
