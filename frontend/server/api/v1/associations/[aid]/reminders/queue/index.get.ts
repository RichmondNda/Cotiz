// GET /api/v1/associations/{aid}/reminders/queue — rm.queue › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { queueList } from '~~/server/mocks/handlers/reminders'

export default defineContractHandler('rm.queue', 'list', queueList)
