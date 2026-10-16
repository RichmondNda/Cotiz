// Jeton d'accès de l'onglet (espaces basculés) : en mémoire seulement (app/utils/jeton-acces.ts). Au rendu serveur,
// aucun jeton : les pages des espaces basculés se rendent dans le navigateur (routeRules de nuxt.config).
import { creerJetonAcces } from '~/utils/jeton-acces'
import type { JetonAcces } from '~/utils/jeton-acces'

const SANS_JETON: JetonAcces = { valeur: () => null, definir: () => {}, renouveler: async () => false }

let instance: JetonAcces | null = null

export function useJetonAcces(): JetonAcces {
  if (import.meta.server) return SANS_JETON
  instance ??= creerJetonAcces({
    fetch: globalThis.fetch.bind(globalThis),
    locks: 'locks' in navigator ? { request: (nom, fn) => navigator.locks.request(nom, () => fn()) } : undefined,
  })
  return instance
}
