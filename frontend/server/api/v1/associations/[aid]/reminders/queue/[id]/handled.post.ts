// POST /api/v1/associations/{aid}/reminders/queue/{id}/handled — rm.queue › handled (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { queueHandled } from '~~/server/mocks/handlers/reminders'

export default defineContractHandler('rm.queue', 'handled', queueHandled)
