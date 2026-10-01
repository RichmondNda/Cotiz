// GET /api/v1/platform/plans — pf.plans › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { plansList } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.plans', 'list', plansList)
