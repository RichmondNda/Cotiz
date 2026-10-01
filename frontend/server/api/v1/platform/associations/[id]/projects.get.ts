// GET /api/v1/platform/associations/{id}/projects — pf.asso.sub › projects (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { associationProjects } from '~~/server/mocks/handlers/platform'

export default defineContractHandler('pf.asso.sub', 'projects', associationProjects)
