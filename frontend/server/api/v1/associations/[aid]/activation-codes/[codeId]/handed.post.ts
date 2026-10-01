// POST /api/v1/associations/{aid}/activation-codes/{codeId}/handed — mb.codes › markHanded (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { codeHanded } from '~~/server/mocks/handlers/members'

export default defineContractHandler('mb.codes', 'markHanded', codeHanded)
