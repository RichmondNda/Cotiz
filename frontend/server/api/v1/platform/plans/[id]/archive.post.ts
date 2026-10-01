// POST /api/v1/platform/plans/{id}/archive — pf.plan.archive › archive (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { planArchive } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.plan.archive', 'archive', planArchive)
