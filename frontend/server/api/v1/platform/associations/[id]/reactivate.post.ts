// POST /api/v1/platform/associations/{id}/reactivate — pf.asso.suspend › reactivate (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { associationReactivate } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.asso.suspend', 'reactivate', associationReactivate)
