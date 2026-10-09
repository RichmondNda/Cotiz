// GET /api/v1/public/plans — pub.plans › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { publicPlans } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pub.plans', 'list', publicPlans)
