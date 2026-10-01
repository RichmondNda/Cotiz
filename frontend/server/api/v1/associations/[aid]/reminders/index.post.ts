// POST /api/v1/associations/{aid}/reminders — rm.send › send (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { send } from '~~/server/mocks/handlers/reminders'

export default defineContractHandler('rm.send', 'send', send)
