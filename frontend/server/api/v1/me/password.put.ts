// PUT /api/v1/me/password — me.profile › changePassword (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { changePassword } from '~~/server/mocks/handlers/session'

export default defineContractHandler('me.profile', 'changePassword', changePassword)
