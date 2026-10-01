// POST /api/v1/me/payments/allocation-preview — me.alloc › preview (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { allocationPreview } from '~~/server/mocks/handlers/subscriber'

export default defineContractHandler('me.alloc', 'preview', allocationPreview)
