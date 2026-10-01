// PATCH /api/v1/platform/plans/{id} — pf.plan.write › patch (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { planPatch } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.plan.write', 'patch', planPatch)
