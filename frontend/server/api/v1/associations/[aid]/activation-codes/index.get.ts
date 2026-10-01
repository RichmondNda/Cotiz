// GET /api/v1/associations/{aid}/activation-codes — mb.codes › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { codesList } from '~~/server/mocks/handlers/members'

export default defineContractHandler('mb.codes', 'list', codesList)
