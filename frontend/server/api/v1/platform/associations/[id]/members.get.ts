// GET /api/v1/platform/associations/{id}/members — pf.asso.sub › members (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { associationMembers } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.asso.sub', 'members', associationMembers)
