// GET /api/v1/platform/staff — pf.staff › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { staffList } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.staff', 'list', staffList)
