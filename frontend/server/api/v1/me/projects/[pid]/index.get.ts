// GET /api/v1/me/projects/{pid} — me.project › get (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { projectGet } from '~~/server/mocks/handlers/subscriber'

export default defineContractHandler('me.project', 'get', projectGet)
