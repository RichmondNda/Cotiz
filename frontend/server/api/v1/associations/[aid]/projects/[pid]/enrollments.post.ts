// POST /api/v1/associations/{aid}/projects/{pid}/enrollments — en.create › create (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { enrollmentCreate } from '~~/server/mocks/handlers/members'

export default defineContractHandler('en.create', 'create', enrollmentCreate)
