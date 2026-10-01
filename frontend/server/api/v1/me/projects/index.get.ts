// GET /api/v1/me/projects — me.projects › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { projectsList } from '~~/server/mocks/handlers/subscriber'

export default defineContractHandler('me.projects', 'list', projectsList)
