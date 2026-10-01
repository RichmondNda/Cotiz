// GET /api/v1/associations/{aid}/reminders/history — rm.hist › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { historyList } from '~~/server/mocks/handlers/reminders'

export default defineContractHandler('rm.hist', 'list', historyList)
