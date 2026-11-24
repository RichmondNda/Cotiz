import { AccessToken, ENDPOINTS, type EventEnvelope } from '@cotiz/contracts';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionFamilies } from '../../src/modules/identity/application/session-families.js';
import { StaffRemovedConsumer } from '../../src/modules/identity/events/staff-removed.consumer.js';
import { RevokedSessions } from '../../src/modules/identity/infra/revoked-sessions.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { EventConsumers } from '../../src/shared/outbox/index.js';
import type { RedisClient } from '../../src/shared/redis/redis.module.js';
import { TenantDatabase, WORKER_PROCESS } from '../../src/shared/tenant-context/tenant-database.js';
import { platformLogin } from '../support/platform-mfa.js';
import {
  codeOf,
  D,
  OWNERS,
  PASSWORD,
  type PlatformFixture,
  STAFF,
  startPlatformFixture,
} from './platform-associations.fixture.js';

/**
 * Lot 4.7 · étape 2 : personnel plateforme (pf.staff, `platform.staff.manage` : owner seul). Invitation par code
 * `staff_invite` affiché avec message prêt (aucun email), activation par auth.activate (espace plateforme), dernier
 * owner protégé (`last_owner`), retrait : accès refusé aussitôt, sessions révoquées par staff.changed.
 */

const STAFF_OPS = ENDPOINTS['pf.staff'].operations;
const ADMIN = { id: '00000000-0000-7000-8000-0000000047a1', email: 'admin-staff@cotiz.test' };
/** Personne invitée : une adresse par test (une activée n'est plus invitable). */
const NEW = { email: '', firstName: 'Mariam', lastName: 'Sylla' };
let invitations = 0;
const NEW_PASSWORD = 'Fromager-Bassam-2026';

describe('personnel plateforme (pf.staff)', () => {
  let f: PlatformFixture;
  let redis: Redis;
  let db: TenantDatabase;
  const consumers = new EventConsumers();
  let consumer: StaffRemovedConsumer;
  let owner: string;

  const list = async (token = owner) => {
    const res = await f.call('/platform/staff', { token });
    expect(res.status).toBe(200);
    return STAFF_OPS.list.response.body.parse(await res.json());
  };
  const invite = (body: Record<string, unknown> = {}, token = owner) =>
    f.call('/platform/staff/invitations', { token, method: 'POST', body: { ...NEW, role: 'support', ...body } });
  const invited = async (body: Record<string, unknown> = {}) => {
    const res = await invite(body);
    expect(res.status).toBe(201);
    return STAFF_OPS.invite.response.body.parse(await res.json());
  };
  const patch = (uid: string, role: string, token = owner) =>
    f.call(`/platform/staff/${uid}`, { token, method: 'PATCH', body: { role } });
  const remove = (uid: string, token = owner) => f.call(`/platform/staff/${uid}`, { token, method: 'DELETE' });
  const activate = (identifier: string, code: string, space = 'platform') =>
    f.call('/auth/activate', { method: 'POST', body: { space, identifier, code, newPassword: NEW_PASSWORD } });
  const changes = async () =>
    (
      (await f.h.superuser(`SELECT payload FROM outbox_events WHERE event_type = 'staff.changed' ORDER BY id`))
        .rows as { payload: { userId: string; change: string } }[]
    ).map((r) => r.payload);
  const audits = async (action: string) =>
    (
      (await f.h.superuser(`SELECT entity_id FROM audit_logs WHERE action = $1`, [action])).rows as {
        entity_id: string;
      }[]
    ).map((r) => r.entity_id);

  /** Livre les staff.changed au consommateur identity, comme le worker (espace system : événement sans association). */
  const deliver = async () => {
    const { rows } = await f.h.superuser(
      `SELECT id, actor_user_id, payload, occurred_at FROM outbox_events WHERE event_type = 'staff.changed' ORDER BY id`,
    );
    for (const event of rows as {
      id: string;
      actor_user_id: string;
      payload: Record<string, unknown>;
      occurred_at: Date;
    }[]) {
      const envelope: EventEnvelope = {
        id: event.id,
        type: 'staff.changed',
        version: 1,
        occurredAt: event.occurred_at.toISOString(),
        associationId: null,
        actorUserId: event.actor_user_id,
        aggregate: { type: 'platform_staff', id: String(event.payload.userId) },
        payload: event.payload,
      };
      for (const handler of consumers.for('staff.changed')) {
        await db.withTenantContext({ space: 'system' }, () => handler.handle(envelope));
      }
    }
  };

  beforeAll(async () => {
    f = await startPlatformFixture();
    await f.h.superuser(
      `INSERT INTO users (id, email, first_name, last_name, status) VALUES ($1, $2, 'Ama', 'Admin', 'active')`,
      [ADMIN.id, ADMIN.email],
    );
    await f.h.superuser(`INSERT INTO credentials (user_id, password_hash) VALUES ($1, $2)`, [
      ADMIN.id,
      await new SecretHasher().hash(PASSWORD),
    ]);
    await f.h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'admin')`, [ADMIN.id]);
    redis = new Redis(f.redis.getConnectionUrl(), { maxRetriesPerRequest: 1 });
    db = new TenantDatabase({ connectionString: f.h.db.urlFor('cotiz_app'), max: 2, [WORKER_PROCESS]: true });
    consumer = new StaffRemovedConsumer(
      consumers,
      new SessionFamilies(),
      new RevokedSessions({ redis } as RedisClient),
    );
    consumer.onModuleInit();
    owner = await f.login('platform', STAFF.owner.email);
  });

  afterAll(async () => {
    consumer.onModuleDestroy();
    redis.disconnect();
    await db.onModuleDestroy();
    await f.stop();
  });

  beforeEach(async () => {
    NEW.email = `mariam-${String(++invitations)}@cotiz.test`;
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type = 'staff.changed'`);
    await f.h.superuser(`DELETE FROM one_time_codes WHERE purpose = 'staff_invite'`);
    // Le support et l'admin du jeu retrouvent leur rôle ; les personnes invitées par un test disparaissent.
    await f.h.superuser(
      `INSERT INTO platform_staff (user_id, role) VALUES ($1, 'support'), ($2, 'admin')
       ON CONFLICT (user_id) DO UPDATE SET role = excluded.role`,
      [STAFF.support.id, ADMIN.id],
    );
    await f.h.superuser(`DELETE FROM platform_staff WHERE user_id NOT IN ($1, $2, $3)`, [
      STAFF.owner.id,
      STAFF.support.id,
      ADMIN.id,
    ]);
  });

  it('owner seul : admin et support 403, gestionnaire 404', async () => {
    const items = (await list()).items;
    expect(items.map((m) => [m.user.email, m.role, m.status])).toEqual([
      [STAFF.owner.email, 'owner', 'active'],
      [ADMIN.email, 'admin', 'active'],
      [STAFF.support.email, 'support', 'active'],
    ]);
    for (const email of [ADMIN.email, STAFF.support.email]) {
      const token = await f.login('platform', email);
      const res = await f.call('/platform/staff', { token });
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('forbidden');
      expect((await invite({}, token)).status).toBe(403);
      expect((await patch(STAFF.owner.id, 'support', token)).status).toBe(403);
      expect((await remove(STAFF.owner.id, token)).status).toBe(403);
    }
    const manager = await f.login('association', OWNERS.yao.email);
    expect((await f.call('/platform/staff', { token: manager })).status).toBe(404);
    expect((await invite({}, manager)).status).toBe(404);
  });

  it('invitation : compte en attente, code staff_invite affiché, activation plateforme puis enrôlement 2FA', async () => {
    const { member, handoff } = await invited({ role: 'admin' });
    expect(member).toMatchObject({ role: 'admin', status: 'invited', lastLoginAt: null });
    expect(member.user).toMatchObject({ email: NEW.email, firstName: NEW.firstName, lastName: NEW.lastName });
    expect(handoff.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(handoff.message).toContain(handoff.code);
    expect(handoff.activationUrl).toContain('/activer?espace=plateforme');
    expect(handoff.recipient.email).toBe(NEW.email);
    const codes = await f.h.superuser(
      `SELECT purpose, issued_by, code_encrypted FROM one_time_codes WHERE user_id = $1`,
      [member.user.id],
    );
    expect(codes.rows).toEqual([{ purpose: 'staff_invite', issued_by: STAFF.owner.id, code_encrypted: null }]);
    expect((await list()).items.find((m) => m.user.id === member.user.id)?.status).toBe('invited');
    expect(await changes()).toEqual([{ userId: member.user.id, change: 'invited' }]);
    expect(await audits('staff.invite')).toContain(member.user.id);

    // Autre espace : le code n'active rien.
    expect(await codeOf(await activate(NEW.email, handoff.code, 'association'))).toBe('invalid_code');
    const res = await activate(NEW.email, handoff.code);
    expect(res.status).toBe(200);
    const token = AccessToken.parse(await res.json()).accessToken;
    // Session restreinte : le second facteur s'active avant tout accès à la plateforme.
    expect((await f.call('/platform/associations', { token })).status).toBe(403);
    const full = await platformLogin({ app: f.app, base: f.base, identifier: NEW.email, password: NEW_PASSWORD });
    expect((await f.call('/platform/associations', { token: full.accessToken })).status).toBe(200);
    expect((await list()).items.find((m) => m.user.id === member.user.id)?.status).toBe('active');
    expect((await changes()).map((c) => c.change)).toEqual(['invited', 'joined']);
    expect(await audits('staff.join')).toContain(member.user.id);
    expect(await codeOf(await activate(NEW.email, handoff.code))).toBe('already_activated');
  });

  it('réinvitation : nouveau code, l’ancien ne vaut plus ; compte existant refusé', async () => {
    const first = await invited();
    const second = await invited({ role: 'admin' });
    expect(second.member.user.id).toBe(first.member.user.id);
    expect(second.member.role).toBe('admin');
    expect(await codeOf(await activate(NEW.email, first.handoff.code))).toBe('invalid_code');

    for (const email of [OWNERS.diop.email, STAFF.support.email]) {
      const res = await invite({ email });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ code: 'validation_failed', fields: { email: 'account_exists' } });
    }
  });

  it('rôle : changé et audité ; dernier owner protégé ; personne inconnue 404', async () => {
    const res = await patch(STAFF.support.id, 'admin');
    expect(res.status).toBe(200);
    expect(STAFF_OPS.patch.response.body.parse(await res.json())).toMatchObject({ role: 'admin', status: 'active' });
    expect(await changes()).toEqual([{ userId: STAFF.support.id, change: 'role_changed' }]);
    expect(await audits('staff.change_role')).toContain(STAFF.support.id);

    const last = await patch(STAFF.owner.id, 'admin');
    expect(last.status).toBe(409);
    expect(await codeOf(last)).toBe('last_owner');
    expect((await patch(crypto.randomUUID(), 'admin')).status).toBe(404);
    expect((await patch(OWNERS.diop.id, 'admin')).status).toBe(404); // gestionnaire, pas personnel

    // Un second owner actif : le premier peut alors céder son rôle.
    expect((await patch(ADMIN.id, 'owner')).status).toBe(200);
    expect((await patch(STAFF.owner.id, 'admin')).status).toBe(200);
    await f.h.superuser(`UPDATE platform_staff SET role = 'owner' WHERE user_id = $1`, [STAFF.owner.id]);
  });

  it('retrait : dernier owner protégé ; retiré refusé aussitôt, sessions révoquées par staff.changed', async () => {
    const lastOwner = await remove(STAFF.owner.id);
    expect(lastOwner.status).toBe(409);
    expect(await codeOf(lastOwner)).toBe('last_owner');

    const support = await platformLogin({
      app: f.app,
      base: f.base,
      identifier: STAFF.support.email,
      password: PASSWORD,
    });
    expect((await f.call('/platform/associations', { token: support.accessToken })).status).toBe(200);
    expect((await remove(STAFF.support.id)).status).toBe(204);
    // Effet immédiat : plus de rôle plateforme, avant même le consommateur.
    expect((await f.call('/platform/associations', { token: support.accessToken })).status).not.toBe(200);
    expect((await list()).items.map((m) => m.user.id)).not.toContain(STAFF.support.id);
    expect(await audits('staff.remove')).toContain(STAFF.support.id);
    expect(await changes()).toEqual([{ userId: STAFF.support.id, change: 'removed' }]);

    await deliver();
    const revoked = await f.call('/me', { token: support.accessToken });
    expect(revoked.status).toBe(401);
    expect(await codeOf(revoked)).toBe('session_revoked');
    const open = await f.h.superuser(
      `SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND space = 'platform' AND revoked_at IS NULL`,
      [STAFF.support.id],
    );
    expect(open.rows).toEqual([{ n: 0 }]);
    const relogin = await f.call('/auth/login', {
      method: 'POST',
      body: { space: 'platform', identifier: STAFF.support.email, password: PASSWORD },
    });
    expect(await codeOf(relogin)).toBe('wrong_space');
    expect((await remove(STAFF.support.id)).status).toBe(404);
    // Le compte reste : seule l'appartenance au personnel disparaît.
    const user = await f.h.superuser(`SELECT status FROM users WHERE id = $1`, [STAFF.support.id]);
    expect(user.rows).toEqual([{ status: 'active' }]);
  });

  it('invité au personnel : une association ne peut ni l’inviter ni activer son compte', async () => {
    const { member } = await invited({ role: 'owner' });
    const yao = await f.login('association', OWNERS.yao.email);
    const res = await f.call(`/associations/${D}/team/invitations`, {
      token: yao,
      method: 'POST',
      body: { ...NEW, role: 'manager' },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'validation_failed', fields: { email: 'account_unavailable' } });
    const memberships = await f.h.superuser(`SELECT count(*)::int AS n FROM memberships WHERE user_id = $1`, [
      member.user.id,
    ]);
    expect(memberships.rows).toEqual([{ n: 0 }]);
    const user = await f.h.superuser(`SELECT status FROM users WHERE id = $1`, [member.user.id]);
    expect(user.rows).toEqual([{ status: 'pending_activation' }]);
  });

  it('retiré avant activation : réinvitable (même compte, nouveau code)', async () => {
    const first = await invited();
    expect((await remove(first.member.user.id)).status).toBe(204);
    const again = await invited({ role: 'admin' });
    expect(again.member.user.id).toBe(first.member.user.id);
    expect(again.member).toMatchObject({ role: 'admin', status: 'invited' });
    expect((await activate(NEW.email, again.handoff.code)).status).toBe(200);
  });

  it('courses : deux owners qui se rétrogradent l’un l’autre, deux invitations de la même adresse', async () => {
    for (let round = 0; round < 5; round++) {
      await f.h.superuser(`UPDATE platform_staff SET role = 'owner' WHERE user_id IN ($1, $2)`, [
        STAFF.owner.id,
        ADMIN.id,
      ]);
      const admin = await f.login('platform', ADMIN.email);
      const results = await Promise.all([patch(STAFF.owner.id, 'admin'), patch(ADMIN.id, 'admin', admin)]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      const owners = await f.h.superuser(`SELECT count(*)::int AS n FROM platform_staff WHERE role = 'owner'`);
      expect(owners.rows).toEqual([{ n: 1 }]);
    }
    await f.h.superuser(`UPDATE platform_staff SET role = 'owner' WHERE user_id = $1`, [STAFF.owner.id]);
    await f.h.superuser(`UPDATE platform_staff SET role = 'admin' WHERE user_id = $1`, [ADMIN.id]);

    for (let round = 0; round < 3; round++) {
      NEW.email = `course-${String(round)}-${String(invitations)}@cotiz.test`;
      const results = await Promise.all([invite(), invite()]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      const rows = await f.h.superuser(
        `SELECT count(*)::int AS users,
                (SELECT count(*)::int FROM one_time_codes c JOIN users u ON u.id = c.user_id
                  WHERE u.email = $1 AND c.consumed_at IS NULL AND c.expires_at > now()) AS live
           FROM users WHERE email = $1`,
        [NEW.email],
      );
      expect(rows.rows).toEqual([{ users: 1, live: 1 }]);
    }
  });

  it('invitation retirée avant activation : le code ne vaut plus rien', async () => {
    const { member, handoff } = await invited();
    expect((await remove(member.user.id)).status).toBe(204);
    expect(await codeOf(await activate(NEW.email, handoff.code))).toBe('invalid_code');
  });
});
