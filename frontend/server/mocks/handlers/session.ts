// Authentification, identité, profil, préférences et notifications (auth.*, me, me.profile, me.prefs, nt.*).
// Identifiants des écrans de connexion : server/mocks/IDENTIFIANTS.md.
import { motDePasseAcceptable } from '../../../app/utils/mot-de-passe'
import { db } from '../db'
import type { MockContext, MockSession } from '../http'
import { checkVersion, nowInstant, problem, requireSession } from '../http'
import { me as meView, notification, userRow } from '../views'
import { page } from './list'

export const PASSWORD = 'motdepasse'
/** Mot de passe provisoire = code d'activation remis par l'association (format du contrat, lot 1.1). */
export const ACTIVATION_CODE = 'K7M4-P9QX'
export const SUSPENDED_PASSWORD = 'suspendu'
export const MFA_CODE = '481902'
export const RESET_CODE_OK = '123456'
export const RESET_CODE_EXPIRED = '000000'
const MAX_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000

const failures = new Map<string, { count: number, lockedUntil?: number }>()

function locked(key: string): boolean {
  const f = failures.get(key)
  if (!f?.lockedUntil) return false
  if (Date.now() < f.lockedUntil) return true
  failures.delete(key)
  return false
}

function fail(key: string): never {
  const f = failures.get(key) ?? { count: 0 }
  f.count += 1
  if (f.count >= MAX_FAILURES) f.lockedUntil = Date.now() + LOCK_MS
  failures.set(key, f)
  problem(f.lockedUntil ? 'account_locked' : 'invalid_credentials')
}

const token = (space: MockSession['space']) => ({
  accessToken: `mock.${space}.${Date.now()}`,
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  space,
})

const ROLE = { subscriber: 'souscripteur', association: 'gestionnaire', platform: 'superadmin' } as const

/** Personne du jeu qui se connecte avec cet identifiant dans cet espace. */
function account(space: MockSession['space'], identifier: string) {
  const id = identifier.trim().toLowerCase()
  if (space === 'subscriber') {
    const u = db.users.find(x => x.phone === identifier && db.memberships.some(m => m.userId === x.id && m.role === 'subscriber'))
    return u ?? null
  }
  if (space === 'association') {
    return db.users.find(x => x.email?.toLowerCase() === id && db.memberships.some(m => m.userId === x.id && m.role !== 'subscriber' && m.status === 'active')) ?? null
  }
  return db.users.find(x => x.email?.toLowerCase() === id && db.staff.some(s => s.userId === x.id && s.status === 'active')) ?? null
}

export function login(ctx: MockContext<'auth.login', 'login'>) {
  const { space, identifier, password } = ctx.body
  const key = `${space}:${identifier.toLowerCase()}`
  if (locked(key)) problem('account_locked')
  const u = account(space, identifier)
  if (u && space === 'association' && password === SUSPENDED_PASSWORD) problem('association_suspended')
  if (u && password === ACTIVATION_CODE && space !== 'platform') {
    failures.delete(key)
    problem('account_not_activated')
  }
  if (!u || password !== PASSWORD) fail(key)
  failures.delete(key)
  if (space === 'platform') {
    return { status: 'mfa_required' as const, mfaToken: `mfa.${u.id}`, expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() }
  }
  ctx.setRole?.(ROLE[space])
  return { status: 'authenticated' as const, ...token(space) }
}

export function mfaVerify(ctx: MockContext<'auth.mfa', 'verify'>) {
  if (!('code' in ctx.body) || ctx.body.code !== MFA_CODE) problem('invalid_code')
  ctx.setRole?.('superadmin')
  return token('platform')
}

export function activate(ctx: MockContext<'auth.activate', 'activate'>) {
  const { space, identifier, code, newPassword } = ctx.body
  if (space === 'platform' || !account(space, identifier) || code.replace('-', '').toUpperCase() !== ACTIVATION_CODE.replace('-', '')) problem('invalid_code')
  if (!motDePasseAcceptable(newPassword)) problem('weak_password')
  ctx.setRole?.(ROLE[space])
  return token(space)
}

export function forgot(_ctx: MockContext<'auth.forgot', 'forgot'>) {
  // Réponse identique que le compte existe ou non (202 sans corps).
  return null
}

export function verify(ctx: MockContext<'auth.verify', 'verify'>) {
  if (ctx.body.code === RESET_CODE_EXPIRED) problem('code_expired')
  if (ctx.body.code !== RESET_CODE_OK) problem('invalid_code')
  return { resetToken: `reset.${ctx.body.identifier}`, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }
}

export function reset(ctx: MockContext<'auth.reset', 'reset'>) {
  if (!ctx.body.resetToken.startsWith('reset.')) problem('reset_token_invalid')
  if (!motDePasseAcceptable(ctx.body.newPassword)) problem('weak_password')
  return null
}

export function logout(ctx: MockContext<'auth.logout', 'logout'>) {
  ctx.setRole?.(null)
  return null
}

// ---------------------------------------------------------------- Identité et profil

export function me(ctx: MockContext<'me', 'get'>) {
  const view = meView(requireSession(ctx))
  // Rapports : graphiques avancés « Bientôt disponibles » (MgProjetRapports).
  if (ctx.scenario === 'graphiques-bientot-disponibles') view.features = view.features.filter(f => f !== 'analytics')
  return view
}

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

// ---------------------------------------------------------------- Notifications

function notificationsOf(ctx: { session: MockSession | null, scenario: string | undefined }) {
  const session = requireSession(ctx)
  if (ctx.scenario === 'vide') return []
  // Gestionnaire : les notifications de son association courante seulement.
  const rows = db.notifications
    .filter(n => n.userId === session.userId)
    .filter(n => session.space !== 'association' || n.associationId === session.associationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return ctx.scenario === 'tout-lu' ? rows.map(n => ({ ...n, readAt: n.readAt ?? n.createdAt })) : rows
}

export function notificationsList(ctx: MockContext<'nt.list', 'list'>) {
  let rows = notificationsOf(ctx)
  if (ctx.query.unread) rows = rows.filter(n => !n.readAt)
  if (ctx.query.type) rows = rows.filter(n => n.type === ctx.query.type)
  return page(rows.map(notification), ctx.query)
}

export function unreadCount(ctx: MockContext<'nt.list', 'unreadCount'>) {
  return { count: notificationsOf(ctx).filter(n => !n.readAt).length }
}

export function notificationRead(ctx: MockContext<'nt.read', 'read'>) {
  const userId = requireSession(ctx).userId
  const n = db.notifications.find(x => x.id === ctx.params.id && x.userId === userId) ?? problem('not_found')
  n.readAt ??= nowInstant()
  return notification(n)
}

export function notificationsReadAll(ctx: MockContext<'nt.read', 'readAll'>) {
  const rows = notificationsOf(ctx).filter(n => !n.readAt)
  const now = nowInstant()
  for (const r of rows) {
    const n = db.notifications.find(x => x.id === r.id)
    if (n) n.readAt = now
  }
  return { updated: rows.length }
}
