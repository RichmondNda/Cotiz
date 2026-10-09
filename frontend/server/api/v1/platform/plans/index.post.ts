// POST /api/v1/platform/plans — pf.plan.write › create (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { planCreate } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.plan.write', 'create', planCreate)
