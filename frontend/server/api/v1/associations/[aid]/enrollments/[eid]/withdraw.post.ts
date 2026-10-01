// POST /api/v1/associations/{aid}/enrollments/{eid}/withdraw — en.withdraw › withdraw (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { enrollmentWithdraw } from '~~/server/mocks/handlers/members'

export default defineContractHandler('en.withdraw', 'withdraw', enrollmentWithdraw)
