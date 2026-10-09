// GET /api/v1/associations/{aid}/reminder-rules — rm.rules › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { rulesList } from '~~/server/mocks/handlers/reminders'

export default defineContractHandler('rm.rules', 'list', rulesList)
