// POST /api/v1/associations/{aid}/reminder-rules — rm.rules › create (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { ruleCreate } from '~~/server/mocks/handlers/reminders'

export default defineContractHandler('rm.rules', 'create', ruleCreate)
