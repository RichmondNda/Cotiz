// POST /api/v1/uploads — fl.upload › create (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { uploadCreate } from '~~/server/mocks/handlers/imports'

export default defineContractHandler('fl.upload', 'create', uploadCreate)
