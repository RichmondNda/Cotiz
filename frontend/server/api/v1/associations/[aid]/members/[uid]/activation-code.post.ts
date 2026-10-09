// POST /api/v1/associations/{aid}/members/{uid}/activation-code — mb.resend › regenerate (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { regenerateCode } from '~~/server/mocks/handlers/members'

export default defineContractHandler('mb.resend', 'regenerate', regenerateCode)
