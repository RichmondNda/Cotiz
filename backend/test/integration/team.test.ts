import { AccessToken, ENDPOINTS, type EventEnvelope } from '@cotiz/contracts';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionFamilies } from '../../src/modules/identity/application/session-families.js';
import { TeamRemovedConsumer } from '../../src/modules/identity/events/team-removed.consumer.js';
import { RevokedSessions } from '../../src/modules/identity/infra/revoked-sessions.js';
import { EventConsumers } from '../../src/shared/outbox/index.js';
import type { RedisClient } from '../../src/shared/redis/redis.module.js';
import { TenantDatabase } from '../../src/shared/tenant-context/index.js';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf, PASSWORD } from './platform-associations.fixture.js';
import { type ProjectsFixture, startProjectsFixture } from './projects.fixture.js';

/**
 * Lot 4.5 · étape 1 : équipe d'une association (tm.team). Jeu : A (Essentiel, 2 places) a déjà 3 gestionnaires (Awa
 * owner, Aminata manager, Koffi viewer) ; B (Pro, 3 places par dérogation) n'a que Koffi (owner).
 * Vérification de l'étape : `last_owner` ; retirer un membre révoque ses sessions.
 */

const TEAM = ENDPOINTS['tm.team'].operations;
const NEW_PASSWORD = 'Fromager-Bassam-2026';

describe('équipe (tm.team)', () => {
  let f: ProjectsFixture;
  let redis: Redis;
  let db: TenantDatabase;
  const consumers = new EventConsumers();
  let consumer: TeamRemovedConsumer;

  const list = async (aid: string, token: string) => {
    const res = await f.call(`/associations/${aid}/team`, { token });
    expect(res.status).toBe(200);
    return TEAM.list.response.body.parse(await res.json());
  };
  const invite = (aid: string, body: Record<string, unknown>, token = f.tokens.koffi) =>
    f.call(`/associations/${aid}/team/invitations`, {
      token,
      method: 'POST',
      body: { firstName: 'Adjoua', lastName: 'Kouassi', email: 'adjoua@test.cotiz.app', role: 'manager', ...body },
    });
  const invited = async (aid: string, body: Record<string, unknown> = {}, token = f.tokens.koffi) => {
    const res = await invite(aid, body, token);
    expect(res.status).toBe(201);
    return TEAM.invite.response.body.parse(await res.json());
  };
  const patch = (aid: string, uid: string, role: string, token = f.tokens.koffi) =>
    f.call(`/associations/${aid}/team/${uid}`, { token, method: 'PATCH', body: { role } });
  const remove = (aid: string, uid: string, token = f.tokens.koffi) =>
    f.call(`/associations/${aid}/team/${uid}`, { token, method: 'DELETE' });
  const activate = (identifier: string, code: string, newPassword: string) =>
    f.call('/auth/activate', { method: 'POST', body: { space: 'association', identifier, code, newPassword } });
  const accessTokenOf = async (res: Response) => {
    expect(res.status).toBe(200);
    return AccessToken.parse(await res.json()).accessToken;
  };
  const membership = async (aid: string, userId: string) =>
    (
      await f.h.superuser(
        `SELECT role, status, joined_at FROM memberships
          WHERE association_id = $1 AND user_id = $2 AND role <> 'subscriber'`,
        [aid, userId],
      )
    ).rows as { role: string; status: string; joined_at: Date | null }[];
  const changes = async (aid: string) =>
    (
      (
        await f.h.superuser(
          `SELECT payload FROM outbox_events WHERE event_type = 'team.changed' AND association_id = $1 ORDER BY id`,
          [aid],
        )
      ).rows as { payload: { userId: string; change: string } }[]
    ).map((r) => r.payload);
  const audits = async (action: string) =>
    (await f.h.superuser(`SELECT entity_id FROM audit_logs WHERE action = $1`, [action])).rows as {
      entity_id: string;
    }[];
  const userIdOf = async (email: string) =>
    ((await f.h.superuser(`SELECT id FROM users WHERE email = $1`, [email])).rows[0] as { id: string }).id;

  /** Livre les team.changed de l'association au consommateur identity, comme le worker. */
  const deliver = async (aid: string) => {
    const { rows } = await f.h.superuser(
      `SELECT id, actor_user_id, payload, occurred_at FROM outbox_events
        WHERE event_type = 'team.changed' AND association_id = $1 ORDER BY id`,
      [aid],
    );
    for (const event of rows as {
      id: string;
      actor_user_id: string;
      payload: Record<string, unknown>;
      occurred_at: Date;
    }[]) {
      const envelope: EventEnvelope = {
        id: event.id,
        type: 'team.changed',
        version: 1,
        occurredAt: event.occurred_at.toISOString(),
        associationId: aid,
        actorUserId: event.actor_user_id,
        aggregate: { type: 'membership', id: String(event.payload.userId) },
        payload: event.payload,
      };
      for (const handler of consumers.for('team.changed')) {
        await db.withTenantContext({ space: 'association', associationId: aid }, () => handler.handle(envelope));
      }
    }
  };

  beforeAll(async () => {
    f = await startProjectsFixture();
    redis = new Redis(f.redis.getConnectionUrl(), { maxRetriesPerRequest: 1 });
    db = new TenantDatabase({ connectionString: f.h.db.urlFor('cotiz_app'), max: 2 });
    consumer = new TeamRemovedConsumer(consumers, new SessionFamilies(), new RevokedSessions({ redis } as RedisClient));
    consumer.onModuleInit();
  });

  afterAll(async () => {
    consumer.onModuleDestroy();
    redis.disconnect();
    await db.onModuleDestroy();
    await f.stop();
  });

  beforeEach(async () => {
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type = 'team.changed'`);
    await f.h.superuser(`DELETE FROM one_time_codes WHERE purpose = 'team_invite'`);
    await f.h.superuser(
      `DELETE FROM memberships WHERE association_id = $1 AND role <> 'subscriber' AND user_id <> $2`,
      [B.id, USERS.koffi],
    );
    await f.h.superuser(
      `UPDATE memberships SET role = 'owner', status = 'active' WHERE association_id = $1 AND user_id = $2`,
      [B.id, USERS.koffi],
    );
    for (const table of ['sessions', 'one_time_codes', 'memberships', 'credentials', 'notification_preferences']) {
      await f.h.superuser(`DELETE FROM ${table} WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'adjoua%')`);
    }
    await f.h.superuser(`DELETE FROM users WHERE email LIKE 'adjoua%'`);
  });

  it('liste : owner d’abord, places de l’abonnement ; réservée à l’owner (manager, lecteur : 403)', async () => {
    const team = await list(A.id, f.tokens.awa);
    expect(team.items.map((m) => [m.member.id, m.role, m.status])).toEqual([
      [USERS.awa, 'owner', 'active'],
      [USERS.aminata, 'manager', 'active'],
      [USERS.koffi, 'viewer', 'active'],
    ]);
    expect(team.items[0]?.member.email).toBe('awa@test.cotiz.app');
    expect(team.seats).toEqual({ used: 3, limit: 2 });
    expect((await f.call(`/associations/${A.id}/team`, { token: f.tokens.aminata })).status).toBe(403);
    expect((await f.call(`/associations/${A.id}/team`, { token: f.tokens.koffi })).status).toBe(403);
  });

  it('invitation d’une nouvelle adresse : compte en attente, code team_invite, acceptation par auth.activate', async () => {
    const { member, handoff } = await invited(B.id, { phone: '+2250707070707', message: 'Bienvenue au bureau !' });
    expect(member).toMatchObject({ role: 'manager', status: 'invited', lastLoginAt: null });
    expect(handoff.code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(handoff.message).toContain('Ressortissants de Man vous invite');
    expect(handoff.message).toContain('choisissez votre mot de passe');
    expect(handoff.message).toContain('Bienvenue au bureau !');
    expect(handoff.message).not.toContain('adjoua@');
    expect(handoff.activationUrl).toContain('/activer?espace=association');
    const userId = member.member.id;
    expect(await changes(B.id)).toEqual([{ associationId: B.id, userId, change: 'invited' }]);
    expect((await audits('team.invite')).map((a) => a.entity_id)).toContain(userId);
    expect((await list(B.id, f.tokens.koffi)).seats).toEqual({ used: 2, limit: 3 });
    // Invitée : pas encore d'accès à l'association.
    expect(
      (
        await f.call('/auth/login', {
          method: 'POST',
          body: { space: 'association', identifier: 'adjoua@test.cotiz.app', password: NEW_PASSWORD },
        })
      ).status,
    ).toBe(401);

    const token = await accessTokenOf(await activate('adjoua@test.cotiz.app', handoff.code, NEW_PASSWORD));
    expect((await membership(B.id, userId))[0]).toMatchObject({ role: 'manager', status: 'active' });
    expect((await membership(B.id, userId))[0]?.joined_at).not.toBeNull();
    expect((await f.call(`/associations/${B.id}/projects`, { token })).status).toBe(200);
    expect((await changes(B.id)).map((c) => c.change)).toEqual(['invited', 'joined']);
    expect((await audits('team.join')).map((a) => a.entity_id)).toContain(userId);
    // Le code ne sert qu'une fois.
    expect(await codeOf(await activate('adjoua@test.cotiz.app', handoff.code, NEW_PASSWORD))).toBe('invalid_code');
  });

  it('réinvitation d’une personne encore invitée : nouveau code, l’ancien ne vaut plus, sans place de plus', async () => {
    const first = await invited(B.id);
    const second = await invited(B.id, { role: 'viewer' });
    expect(second.member.member.id).toBe(first.member.member.id);
    expect(second.handoff.code).not.toBe(first.handoff.code);
    expect((await list(B.id, f.tokens.koffi)).seats.used).toBe(2);
    expect(await membership(B.id, first.member.member.id)).toMatchObject([{ role: 'viewer', status: 'invited' }]);
    expect(await codeOf(await activate('adjoua@test.cotiz.app', first.handoff.code, NEW_PASSWORD))).toBe(
      'invalid_code',
    );
    await accessTokenOf(await activate('adjoua@test.cotiz.app', second.handoff.code, NEW_PASSWORD));
  });

  it('quota de gestionnaires : 409 quota_exceeded (limit, usage), sans compte créé', async () => {
    const full = await invite(A.id, {}, f.tokens.awa);
    expect(full.status).toBe(409);
    expect(await full.json()).toMatchObject({ code: 'quota_exceeded', limit: 2, usage: 3 });
    expect((await f.h.superuser(`SELECT 1 FROM users WHERE email = 'adjoua@test.cotiz.app'`)).rows).toHaveLength(0);

    await invited(B.id);
    await invited(B.id, { email: 'adjoua2@test.cotiz.app' });
    const over = await invite(B.id, { email: 'adjoua3@test.cotiz.app' });
    expect(over.status).toBe(409);
    expect(await codeOf(over)).toBe('quota_exceeded');
  });

  it('refus : rôle owner à l’invitation, gestionnaire déjà active (422 validation_failed)', async () => {
    const owner = await invite(B.id, { role: 'owner' });
    expect(owner.status).toBe(422);
    expect(await owner.json()).toMatchObject({ code: 'validation_failed', fields: { role: 'owner_by_patch' } });
    const self = await invite(B.id, { email: 'koffi@test.cotiz.app' });
    expect(self.status).toBe(422);
    expect(await self.json()).toMatchObject({ code: 'validation_failed', fields: { email: 'already_member' } });
  });

  it('compte existant : acceptation avec le mot de passe ACTUEL, jamais changé ; mot de passe faux refusé', async () => {
    // Moussa : souscripteur de A, compte actif.
    const { member, handoff } = await invited(B.id, { email: 'moussa@test.cotiz.app', role: 'viewer' });
    expect(member.member.id).toBe(USERS.moussa);
    expect(member.member.firstName).not.toBe('Adjoua');
    expect(handoff.message).toContain('votre mot de passe actuel');
    expect(handoff.activationUrl).toMatch(/\/activer\?espace=association&compte=existant$/);
    const hashOf = async () =>
      (
        (await f.h.superuser(`SELECT password_hash FROM credentials WHERE user_id = $1`, [USERS.moussa])).rows[0] as {
          password_hash: string;
        }
      ).password_hash;
    const before = await hashOf();

    const wrong = await activate('moussa@test.cotiz.app', handoff.code, NEW_PASSWORD);
    expect(wrong.status).toBe(422);
    expect(await codeOf(wrong)).toBe('invalid_code');
    expect(await membership(B.id, USERS.moussa)).toMatchObject([{ status: 'invited' }]);

    const token = await accessTokenOf(await activate('moussa@test.cotiz.app', handoff.code, PASSWORD));
    expect(await membership(B.id, USERS.moussa)).toMatchObject([{ role: 'viewer', status: 'active' }]);
    expect(await hashOf()).toBe(before);
    expect((await f.call(`/associations/${B.id}/projects`, { token })).status).toBe(200);
  });

  it('rôle : changé et audité ; dernier owner non rétrogradable (last_owner) ; inconnu 404', async () => {
    const { member } = await invited(B.id);
    const res = await patch(B.id, member.member.id, 'viewer');
    expect(res.status).toBe(200);
    expect(TEAM.patch.response.body.parse(await res.json())).toMatchObject({ role: 'viewer', status: 'invited' });
    expect((await changes(B.id)).map((c) => c.change)).toEqual(['invited', 'role_changed']);
    expect((await audits('team.change_role')).map((a) => a.entity_id)).toContain(member.member.id);

    const last = await patch(B.id, USERS.koffi, 'manager');
    expect(last.status).toBe(409);
    expect(await codeOf(last)).toBe('last_owner');
    expect((await patch(B.id, crypto.randomUUID(), 'viewer')).status).toBe(404);
    expect((await patch(B.id, USERS.fatou, 'viewer')).status).toBe(404); // souscriptrice, pas gestionnaire
  });

  it('retrait : dernier owner protégé ; retiré refusé aussitôt, sessions révoquées par team.changed', async () => {
    const lastOwner = await remove(B.id, USERS.koffi);
    expect(lastOwner.status).toBe(409);
    expect(await codeOf(lastOwner)).toBe('last_owner');

    const { member, handoff } = await invited(B.id);
    const adjoua = await accessTokenOf(await activate('adjoua@test.cotiz.app', handoff.code, NEW_PASSWORD));
    expect((await f.call(`/associations/${B.id}/projects`, { token: adjoua })).status).toBe(200);

    expect((await remove(B.id, member.member.id)).status).toBe(204);
    // Effet immédiat sur l'association (MembershipGuard), avant même le consommateur.
    expect((await f.call(`/associations/${B.id}/projects`, { token: adjoua })).status).toBe(404);
    expect((await list(B.id, f.tokens.koffi)).items.map((m) => m.member.id)).toEqual([USERS.koffi]);
    expect((await audits('team.remove')).map((a) => a.entity_id)).toContain(member.member.id);

    await deliver(B.id);
    const revoked = await f.call('/me', { token: adjoua });
    expect(revoked.status).toBe(401);
    expect(await codeOf(revoked)).toBe('session_revoked');
    const open = await f.h.superuser(
      `SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`,
      [member.member.id],
    );
    expect(open.rows).toEqual([{ n: 0 }]);
    // Reconnexion refusée : plus aucun rôle dans l'espace association.
    const relogin = await f.call('/auth/login', {
      method: 'POST',
      body: { space: 'association', identifier: 'adjoua@test.cotiz.app', password: NEW_PASSWORD },
    });
    expect(await codeOf(relogin)).toBe('wrong_space');
    expect((await remove(B.id, member.member.id)).status).toBe(404);
  });

  it('invitation retirée avant acceptation : le code ne vaut plus rien', async () => {
    const { member, handoff } = await invited(B.id);
    expect((await remove(B.id, member.member.id)).status).toBe(204);
    expect(await codeOf(await activate('adjoua@test.cotiz.app', handoff.code, NEW_PASSWORD))).toBe('invalid_code');
    expect(await userIdOf('adjoua@test.cotiz.app')).toBe(member.member.id);
    expect(
      (
        (await f.h.superuser(`SELECT status FROM users WHERE id = $1`, [member.member.id])).rows[0] as {
          status: string;
        }
      ).status,
    ).toBe('pending_activation');
  });
});
