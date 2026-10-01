// POST /api/v1/associations/{aid}/onboarding/complete — as.onb › complete (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { onboardingComplete } from '~~/server/mocks/handlers/association'

export default defineContractHandler('as.onb', 'complete', onboardingComplete)
