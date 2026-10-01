// GET /api/v1/associations/{aid}/payment-methods — as.pm › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { paymentMethodsList } from '~~/server/mocks/handlers/association'

export default defineContractHandler('as.pm', 'list', paymentMethodsList)
