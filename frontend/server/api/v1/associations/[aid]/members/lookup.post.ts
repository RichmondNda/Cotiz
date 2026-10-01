// POST /api/v1/associations/{aid}/members/lookup — mb.lookup › lookup (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { lookup } from '~~/server/mocks/handlers/members'

export default defineContractHandler('mb.lookup', 'lookup', lookup)
