// POST /api/v1/platform/associations/{id}/suspend — pf.asso.suspend › suspend (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { associationSuspend } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.asso.suspend', 'suspend', associationSuspend)
