// PATCH /api/v1/associations/{aid}/reminder-rules/{id} — rm.rules › patch (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { rulePatch } from '~~/server/mocks/handlers/reminders'

export default defineContractHandler('rm.rules', 'patch', rulePatch)
