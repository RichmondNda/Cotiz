// PUT /api/v1/associations/{aid}/payment-methods — as.pm › replace (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { paymentMethodsReplace } from '~~/server/mocks/handlers/association'

export default defineContractHandler('as.pm', 'replace', paymentMethodsReplace)
