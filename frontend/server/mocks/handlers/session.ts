// Second facteur (auth.mfa) et préférences (me.prefs) ; notifications réelles depuis le lot 2.5, profil (me.profile)
// réel depuis le lot 3.1.
import { db } from '../db'
import type { MockContext, MockSession } from '../http'
import { problem, requireSession } from '../http'

export const MFA_CODE = '481902'

const token = (space: MockSession['space']) => ({
  accessToken: `mock.${space}.${Date.now()}`,
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  space,
})

// Connexion, activation, mot de passe oublié, déconnexion et `GET /me` : vrai back depuis le lot 1.2
// (server/bascule/real-endpoints.ts). Reste simulé : le second facteur du super-admin (auth.mfa, lot 4.7).

export function mfaVerify(ctx: MockContext<'auth.mfa', 'verify'>) {
  if (!('code' in ctx.body) || ctx.body.code !== MFA_CODE) problem('invalid_code')
  ctx.setRole?.('superadmin')
  return token('platform')
}

// ---------------------------------------------------------------- Identité et profil

const AVAILABLE_CHANNELS = ['in_app', 'push'] as const

export function prefsGet(ctx: MockContext<'me.prefs', 'get'>) {
  const userId = requireSession(ctx).userId
  return {
    items: db.preferences.filter(p => p.userId === userId).map(({ type, channel, enabled }) => ({ type, channel, enabled })),
    availableChannels: [...AVAILABLE_CHANNELS],
  }
}

export function prefsReplace(ctx: MockContext<'me.prefs', 'replace'>) {
  const userId = requireSession(ctx).userId
  // Comme le back : canal non proposé → 422, rien d'enregistré ; les réglages non envoyés restent tels quels.
  const fields: Record<string, string> = {}
  ctx.body.items.forEach((i, n) => {
    if (!(AVAILABLE_CHANNELS as readonly string[]).includes(i.channel)) fields[`items.${String(n)}`] = 'unknown_preference'
  })
  if (Object.keys(fields).length > 0) problem('validation_failed', { fields })
  const cle = (p: { type: string, channel: string }) => `${p.type}:${p.channel}`
  const envoyes = new Set(ctx.body.items.map(cle))
  db.preferences = [
    ...db.preferences.filter(p => p.userId !== userId || !envoyes.has(cle(p))),
    ...ctx.body.items.map(i => ({ userId, type: i.type, channel: i.channel, enabled: i.enabled })),
  ]
  return prefsGet(ctx as unknown as MockContext<'me.prefs', 'get'>)
}
