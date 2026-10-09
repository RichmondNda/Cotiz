// GET /api/v1/associations/{aid}/invoices — bl.inv › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { invoices } from '~~/server/mocks/handlers/association'

export default defineContractHandler('bl.inv', 'list', invoices)
