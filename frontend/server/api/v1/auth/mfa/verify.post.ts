// POST /api/v1/auth/mfa/verify — auth.mfa › verify (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { mfaVerify } from '~~/server/mocks/handlers/session'

export default defineContractHandler('auth.mfa', 'verify', mfaVerify)
