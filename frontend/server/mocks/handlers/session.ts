// Second facteur (auth.mfa), profil et préférences (me.profile, me.prefs) ; notifications réelles depuis le lot 2.5.
import { motDePasseAcceptable } from '../../../app/utils/mot-de-passe'
import { db } from '../db'
import type { MockContext, MockSession } from '../http'
import { checkVersion, nowInstant, problem, requireSession } from '../http'
import { userRow } from '../views'

/** Mot de passe actuel des comptes simulés (changement de mot de passe du profil, me.profile). */
export const PASSWORD = 'motdepasse'
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

function profileView(userId: string) {
  const u = userRow(userId)
  return {
    id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, address: u.address, city: u.city,
    locale: u.locale, passwordChangedAt: u.passwordChangedAt, mfaEnabled: db.staff.some(s => s.userId === u.id), version: u.version,
  }
}

export function profileGet(ctx: MockContext<'me.profile', 'get'>) {
  return profileView(requireSession(ctx).userId)
}

export function profilePatch(ctx: MockContext<'me.profile', 'patch'>) {
  const u = userRow(requireSession(ctx).userId)
  checkVersion(ctx, u.version)
  const b = ctx.body
  const email = b.email === undefined ? u.email : b.email
  if (email && db.users.some(x => x.id !== u.id && x.email?.toLowerCase() === email.toLowerCase())) problem('validation_failed', { fields: { email: 'taken' } })
  Object.assign(u, {
    firstName: b.firstName ?? u.firstName, lastName: b.lastName ?? u.lastName, email,
    address: b.address === undefined ? u.address : b.address, city: b.city === undefined ? u.city : b.city,
    locale: b.locale ?? u.locale, version: u.version + 1,
  })
  return profileView(u.id)
}

export function changePassword(ctx: MockContext<'me.profile', 'changePassword'>) {
  const u = userRow(requireSession(ctx).userId)
  if (ctx.body.currentPassword !== PASSWORD) problem('invalid_credentials')
  if (!motDePasseAcceptable(ctx.body.newPassword)) problem('weak_password')
  u.passwordChangedAt = nowInstant()
  return null
}

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
  db.preferences = [
    ...db.preferences.filter(p => p.userId !== userId),
    ...ctx.body.items.map(i => ({ userId, type: i.type, channel: i.channel, enabled: i.enabled })),
  ]
  return prefsGet(ctx as unknown as MockContext<'me.prefs', 'get'>)
}
