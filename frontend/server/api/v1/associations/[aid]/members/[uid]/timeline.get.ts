// GET /api/v1/associations/{aid}/members/{uid}/timeline — mb.timeline › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { memberTimeline } from '~~/server/mocks/handlers/members'

export default defineContractHandler('mb.timeline', 'list', memberTimeline)
