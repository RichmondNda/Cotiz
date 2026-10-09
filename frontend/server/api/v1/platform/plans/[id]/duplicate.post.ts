// POST /api/v1/platform/plans/{id}/duplicate — pf.plan.archive › duplicate (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { planDuplicate } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.plan.archive', 'duplicate', planDuplicate)
