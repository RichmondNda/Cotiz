// POST /api/v1/uploads/{id}/complete — fl.upload › complete (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { uploadComplete } from '~~/server/mocks/handlers/imports'

export default defineContractHandler('fl.upload', 'complete', uploadComplete)
