// POST /api/v1/associations/{aid}/imports/{id}/commit — im.commit › commit (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { importCommit } from '~~/server/mocks/handlers/imports'

export default defineContractHandler('im.commit', 'commit', importCommit)
