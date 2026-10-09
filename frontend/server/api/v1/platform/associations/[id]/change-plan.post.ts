// POST /api/v1/platform/associations/{id}/change-plan — pf.asso.plan › changePlan (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { associationChangePlan } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.asso.plan', 'changePlan', associationChangePlan)
