// GET /api/v1/associations/{aid}/projects/{pid}/enrollments — en.list › list (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { enrollmentsList } from '~~/server/mocks/handlers/members'

export default defineContractHandler('en.list', 'list', enrollmentsList)
