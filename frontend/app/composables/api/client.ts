// Seul point d'accès aux données : client typé de @cotiz/api-client sur les chemins du contrat (`/api/v1/...`).
// Le navigateur ne parle qu'à Nuxt (même origine) : le middleware de bascule sert le mock ou transmet à NestJS.
// - le `?scenario=` de la page part dans l'en-tête `x-cotiz-scenario` (états de données de l'inventaire, dev) ;
// - au rendu serveur, l'appel vise l'origine de la requête et fait suivre le cookie de session ;
// - une erreur `Problem` est convertie en erreur Nuxt (`statusCode`, `data` = Problem) pour les écrans d'erreur.
import { ApiError, createClient } from '@cotiz/api-client'
import type { ApiClient } from '@cotiz/api-client'
import type { MaybeRefOrGetter } from 'vue'

export type { ApiClient }

export function useClient(): ApiClient {
  const route = useRoute()
  const cookie = import.meta.server ? useRequestHeaders(['cookie']) : {}
  const origin = import.meta.server ? useRequestURL().origin : ''
  return createClient({
    baseUrl: origin,
    credentials: 'same-origin',
    headers: () => {
      const headers: Record<string, string> = { ...cookie }
      const scenario = route.query.scenario
      if (typeof scenario === 'string' && scenario) headers['x-cotiz-scenario'] = scenario
      return headers
    },
  })
}

/** Erreur Nuxt équivalente (le `statusCode` sert aux écrans « introuvable » / « erreur »). */
function versErreurNuxt(e: unknown): unknown {
  if (e instanceof ApiError) return createError({ statusCode: e.status, statusMessage: e.problem?.title, data: e.problem ?? undefined })
  return e
}

/**
 * Lecture : `fetcher` compose un ou plusieurs appels du contrat puis adapte la réponse au type de l'écran.
 * Renvoie `{ data, pending, error, refresh }` (awaitable, comme `useFetch`). La clé suit les paramètres et le scénario.
 */
export function useLecture<T>(
  cle: MaybeRefOrGetter<string>,
  fetcher: (client: ApiClient) => Promise<T>,
  options: { immediat?: boolean, watch?: MaybeRefOrGetter<unknown>[] } = {},
) {
  const client = useClient()
  const route = useRoute()
  return useAsyncData<T>(
    () => `${toValue(cle)}:${typeof route.query.scenario === 'string' ? route.query.scenario : ''}`,
    async () => {
      try {
        return await fetcher(client)
      }
      catch (e) {
        throw versErreurNuxt(e)
      }
    },
    { immediate: options.immediat ?? true, watch: options.watch?.map(w => () => toValue(w)) },
  )
}

/** Code du catalogue (docs/specs/errors.yaml) d'une erreur levée par un appel, sinon `undefined`. */
export function codeErreur<C extends string = string>(e: unknown): C | undefined {
  if (e instanceof ApiError) return (e.code ?? undefined) as C | undefined
  const code = (e as { data?: { code?: unknown } })?.data?.code
  return typeof code === 'string' ? (code as C) : undefined
}

/** Erreurs de champ d'un `validation_failed` (`fields.<champ>` = code de règle). */
export function champsErreur(e: unknown): Record<string, string> {
  return e instanceof ApiError && e.problem?.fields ? e.problem.fields : {}
}

/** Charge toutes les pages d'une liste paginée (`{ items, nextCursor }`) : écrans qui paginent côté client. */
export async function toutesLesPages<T>(page: (cursor?: string) => Promise<{ items: T[], nextCursor: string | null, total: number }>) {
  const items: T[] = []
  let r = await page()
  items.push(...r.items)
  while (r.nextCursor) {
    r = await page(r.nextCursor)
    items.push(...r.items)
  }
  return { items, total: r.total }
}
