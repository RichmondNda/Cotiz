// Seul point d'accès aux données : `$fetch` sur `runtimeConfig.public.apiBase` (mocks Nitro en V0).
// Brancher NestJS = changer la base URL. Le paramètre `?scenario=` de la page est propagé à l'API
// (états de données de l'inventaire). Expose `data`, `pending`, `error`, `refresh`.
import type { MaybeRefOrGetter } from 'vue'

type Query = Record<string, string | number | boolean | undefined | null>

export function useApi<T>(
  chemin: MaybeRefOrGetter<string>,
  options: { query?: MaybeRefOrGetter<Query>, cle?: string, immediat?: boolean } = {},
) {
  const config = useRuntimeConfig()
  const route = useRoute()

  const query = computed(() => {
    const q: Query = { ...toValue(options.query) }
    const scenario = route.query.scenario
    if (typeof scenario === 'string' && scenario) q.scenario = scenario
    return Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  })

  const { data, pending, error, refresh, status } = useFetch<T>(() => toValue(chemin), {
    baseURL: config.public.apiBase,
    query,
    // Clé explicite et réactive : chemin + paramètres (sans elle, tous les appels partageraient le même cache).
    key: () => `${options.cle ?? 'api'}:${toValue(chemin)}:${JSON.stringify(query.value)}`,
    immediate: options.immediat ?? true,
    // Les cookies (session mockée) doivent suivre lors du rendu serveur.
    headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
  })

  return { data, pending, error, refresh, status }
}

/**
 * Mutations (POST, PATCH…) : à appeler dans `setup`, renvoie une fonction `$fetch` sur la même base que `useApi`,
 * avec propagation du `?scenario=` de la page (ex. `chargement` pour observer l'état d'envoi).
 * L'erreur de l'API est levée telle quelle : lire son code métier avec `codeErreur()`.
 */
export function useAppelApi() {
  const config = useRuntimeConfig()
  const route = useRoute()
  return <T>(chemin: string, options: { method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: object } = {}) => {
    const scenario = route.query.scenario
    return $fetch<T>(chemin, {
      baseURL: config.public.apiBase,
      method: options.method ?? 'POST',
      body: options.body,
      query: typeof scenario === 'string' && scenario ? { scenario } : undefined,
    })
  }
}

/** Code d'erreur métier (`data.code`) d'une erreur levée par une mutation, sinon `undefined`. */
export function codeErreur<C extends string = string>(e: unknown): C | undefined {
  const code = (e as { data?: { data?: { code?: unknown } } })?.data?.data?.code
  return typeof code === 'string' ? (code as C) : undefined
}
