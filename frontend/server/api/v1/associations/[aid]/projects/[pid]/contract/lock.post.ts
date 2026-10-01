// POST /api/v1/associations/{aid}/projects/{pid}/contract/lock — ct.get › lock (docs/specs/endpoints.yaml)
import { defineContractHandler } from '~~/server/mocks/http'
import { contractLock } from '~~/server/mocks/handlers/association'

export default defineContractHandler('ct.get', 'lock', contractLock)
