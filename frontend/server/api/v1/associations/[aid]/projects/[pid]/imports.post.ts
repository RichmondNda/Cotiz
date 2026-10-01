// POST /api/v1/associations/{aid}/projects/{pid}/imports — im.flow › create (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { importCreate } from '~~/server/mocks/handlers/imports'

export default defineContractHandler('im.flow', 'create', importCreate)
