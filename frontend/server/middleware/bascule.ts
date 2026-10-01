// Bascule mock → NestJS des requêtes `/api/v1/**` (registre server/bascule/real-endpoints.ts, NUXT_MOCKS, NUXT_API_ORIGIN).
import { defineEventHandler } from 'h3'
import { bascule } from '../bascule/proxy'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  return bascule(event, {
    mocks: !['0', 'false', 0, false].includes(config.mocks as string | number | boolean),
    apiOrigin: String(config.apiOrigin),
  })
})
