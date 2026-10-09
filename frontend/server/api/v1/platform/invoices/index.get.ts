// GET /api/v1/platform/invoices — pf.invoices › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { invoicesList } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.invoices', 'list', invoicesList)
