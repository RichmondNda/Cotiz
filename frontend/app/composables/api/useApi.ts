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
