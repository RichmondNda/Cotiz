// Espaces et lots déjà basculés vers le vrai back (registre server/bascule/real-endpoints.ts) : le front s'en sert
// pour savoir si une session est réelle (jeton d'accès) et quelles fonctionnalités sont encore simulées.
import { ENDPOINT_LOTS } from '@cotiz/contracts'
import { REAL_ENDPOINTS } from '~~/server/bascule/real-endpoints'

export type Espace = 'platform' | 'association' | 'subscriber'

const couvre = (rule: 'all' | readonly string[] | undefined, espace: Espace) =>
  rule === 'all' || Boolean(rule?.includes(espace))

/** Session réelle (jeton d'accès, vrai `/me`) pour cet espace ? */
export function espaceBascule(espace: Espace): boolean {
  return couvre(REAL_ENDPOINTS.get('me'), espace)
}

/**
 * Build avec handlers simulés (`NUXT_MOCKS` différent de `0` au build, nuxt.config.ts `vite.define`). Sans eux
 * (production, lot 3.5) : rien n'est simulé, seuls les endpoints du registre existent.
 */
export const AVEC_MOCKS: boolean = typeof __COTIZ_MOCKS__ === 'undefined' ? true : __COTIZ_MOCKS__ !== false

/** Endpoint appelable : simulé (build avec mocks) ou basculé pour cet espace. Sinon, il n'existe pas encore. */
export function endpointDisponible(id: keyof typeof ENDPOINT_LOTS, espace: Espace): boolean {
  return AVEC_MOCKS || couvre(REAL_ENDPOINTS.get(id), espace)
}

/** Lots dont au moins un endpoint est basculé pour cet espace. */
export function lotsBascules(espace: Espace): Set<string> {
  const lots = new Set<string>()
  for (const [id, rule] of REAL_ENDPOINTS) if (couvre(rule, espace)) lots.add(ENDPOINT_LOTS[id])
  return lots
}
