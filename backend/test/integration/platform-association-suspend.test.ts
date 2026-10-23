import { Controller, Get } from '@nestjs/common';
import { type EventEnvelope, PlatformAssociationDetail } from '@cotiz/contracts';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionFamilies } from '../../src/modules/identity/application/session-families.js';
import { AssociationSuspendedConsumer } from '../../src/modules/identity/events/association-suspended.consumer.js';
import { RevokedSessions } from '../../src/modules/identity/infra/revoked-sessions.js';
import { Can, Endpoint } from '../../src/shared/http/index.js';
import { EventConsumers } from '../../src/shared/outbox/index.js';
import type { RedisClient } from '../../src/shared/redis/redis.module.js';
import { TenantDatabase } from '../../src/shared/tenant-context/index.js';
import { A, B, USERS } from '../isolation/harness.js';
import {
  C,
  codeOf,
  D,
  OWNERS,
  type PlatformFixture,
  STAFF,
  startPlatformFixture,
} from './platform-associations.fixture.js';

/**
 * Lot 1.4 · étape 3 : suspension et réactivation d'une association (pf.asso.suspend). Vérification de l'étape : un
 * gestionnaire connecté reçoit `association_suspended` dès la requête suivante ; ses sessions de l'espace association
 * sont révoquées (association.suspended, worker) et sa reconnexion refusée ; la réactivation rétablit l'accès.
 */

/** Route sonde de l'espace association (MembershipGuard), rattachée à un endpoint du contrat. */
@Controller('associations-probe/:aid')
class AssociationProbe {
  @Get()
  @Endpoint('as.get', 'get')
  @Can('association.read')
  read() {
    return { ok: true };
  }
}

const AWA = 'awa@test.cotiz.app';
const KOFFI = 'koffi@test.cotiz.app';

describe('suspension d’une association (pf.asso.suspend)', () => {
  let f: PlatformFixture;
  let owner: string;
  let support: string;
  let redis: Redis;
  let db: TenantDatabase;
  const consumers = new EventConsumers();
  let consumer: AssociationSuspendedConsumer;

  const suspend = (id: string, body: unknown, token = owner) =>
    f.call(`/platform/associations/${id}/suspend`, { token, method: 'POST', body });
  const reactivate = (id: string, token = owner) =>
    f.call(`/platform/associations/${id}/reactivate`, { token, method: 'POST' });
  /** Horloge de la base (occurred_at) : repère des lignes écrites ensuite par ce test seulement. */
  const dbNow = async () => ((await f.h.superuser(`SELECT clock_timestamp() AS t`)).rows as [{ t: Date }])[0].t;
  /** Frise de la fiche (l'audit est écrit après le cas d'usage : relue par pf.asso.get). */
  const lastEvent = async (id: string) =>
    PlatformAssociationDetail.parse(await (await f.call(`/platform/associations/${id}`, { token: owner })).json())
      .events[0];
  const probe = (aid: string, token: string) => f.call(`/associations-probe/${aid}`, { token });
  const row = async (id: string) =>
    (
      await f.h.superuser(`SELECT status, suspended_at, suspension_reason, version FROM associations WHERE id = $1`, [
        id,
      ])
    ).rows[0] as { status: string; suspended_at: Date | null; suspension_reason: string | null; version: number };
  const events = async (type: string, id: string, since: Date) =>
    (
      await f.h.superuser(
        `SELECT id, association_id, actor_user_id, payload, occurred_at FROM outbox_events
          WHERE event_type = $1 AND aggregate_id = $2 AND occurred_at >= $3 ORDER BY id`,
        [type, id, since],
      )
    ).rows as { id: string; association_id: string; actor_user_id: string; payload: unknown; occurred_at: Date }[];
  const audits = async (action: string, id: string, since: Date) =>
    (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, before, after FROM audit_logs
          WHERE action = $1 AND entity_id = $2 AND occurred_at >= $3 ORDER BY id`,
        [action, id, since],
      )
    ).rows as Record<string, unknown>[];
  /** Sessions encore ouvertes de la personne, par espace. */
  const openSessions = async (userId: string) => {
    const { rows } = await f.h.superuser(
      `SELECT space, count(*)::int AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL GROUP BY space`,
      [userId],
    );
    return Object.fromEntries((rows as { space: string; n: number }[]).map((r) => [r.space, r.n]));
  };

  /** Livre association.suspended au consommateur identity, dans le contexte de l'association (comme le worker). */
  const deliverSuspended = async (associationId: string) => {
    const [event] = await events('association.suspended', associationId, new Date(0));
    expect(event).toBeDefined();
    if (!event) return;
    const envelope: EventEnvelope = {
      id: event.id,
      type: 'association.suspended',
      version: 1,
      occurredAt: event.occurred_at.toISOString(),
      associationId,
      actorUserId: event.actor_user_id,
      aggregate: { type: 'association', id: associationId },
      payload: event.payload as Record<string, unknown>,
    };
    const handlers = consumers.for('association.suspended');
    expect(handlers.map((c) => c.name)).toEqual(['association-suspended-sessions']);
    for (const handler of handlers) {
      await db.withTenantContext({ space: 'association', associationId }, () => handler.handle(envelope));
    }
  };

  beforeAll(async () => {
    f = await startPlatformFixture([AssociationProbe]);
    owner = await f.login('platform', STAFF.owner.email);
    support = await f.login('platform', STAFF.support.email);
    redis = new Redis(f.redis.getConnectionUrl(), { maxRetriesPerRequest: 1 });
    db = new TenantDatabase({ connectionString: f.h.db.urlFor('cotiz_app'), max: 2 });
    consumer = new AssociationSuspendedConsumer(
      consumers,
      new SessionFamilies(),
      new RevokedSessions({ redis } as RedisClient),
    );
    consumer.onModuleInit();
  });

  afterAll(async () => {
    consumer.onModuleDestroy();
    redis.disconnect();
    await db.onModuleDestroy();
    await f.stop();
  });

  beforeEach(async () => {
    await f.h.superuser(
      `UPDATE associations SET status = 'active', suspended_at = NULL, suspension_reason = NULL WHERE id IN ($1, $2)`,
      [A.id, B.id],
    );
    await f.h.superuser(`UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL AND user_id IN ($1, $2)`, [
      USERS.awa,
      USERS.koffi,
    ]);
  });

  it('suspend : statut, date, motif, version ; fiche renvoyée ; audité ; association.suspended', async () => {
    const since = await dbNow();
    const before = await row(A.id);
    const res = await suspend(A.id, { reason: '  Abonnement impayé  ', confirmName: 'Entraide Yopougon' });
    expect(res.status).toBe(200);
    const detail = PlatformAssociationDetail.parse(await res.json());
    expect(detail.status).toBe('suspended');
    expect(detail.suspendedAt).not.toBeNull();
    expect(await lastEvent(A.id)).toMatchObject({ type: 'association.suspended' });

    const after = await row(A.id);
    expect(after).toMatchObject({ status: 'suspended', suspension_reason: 'Abonnement impayé' });
    expect(after.suspended_at).toBeInstanceOf(Date);
    expect(after.version).toBe(before.version + 1);

    expect(await events('association.suspended', A.id, since)).toEqual([
      expect.objectContaining({
        association_id: A.id,
        actor_user_id: STAFF.owner.id,
        payload: { associationId: A.id, reason: 'Abonnement impayé' },
      }),
    ]);
    expect(await audits('association.suspend', A.id, since)).toEqual([
      expect.objectContaining({
        association_id: A.id,
        actor_user_id: STAFF.owner.id,
        before: { status: 'active', suspensionReason: null },
        after: { status: 'suspended', suspensionReason: 'Abonnement impayé' },
      }),
    ]);
  });

  it('confirmation : nom différent → 422 confirmName mismatch, rien ne change', async () => {
    const before = await row(A.id);
    const res = await suspend(A.id, { reason: 'Impayé', confirmName: 'Entraide Yopougo' });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'validation_failed', fields: { confirmName: 'mismatch' } });
    expect(await row(A.id)).toEqual(before);
  });

  it('motif vide (espaces) ou absent → 422', async () => {
    expect((await suspend(A.id, { reason: '   ', confirmName: 'Entraide Yopougon' })).status).toBe(422);
    expect((await suspend(A.id, { confirmName: 'Entraide Yopougon' })).status).toBe(422);
    expect((await row(A.id)).status).toBe('active');
  });

  it('transitions interdites : 409 invalid_state (déjà suspendue, onboarding, réactiver une active)', async () => {
    const res = await suspend(C, { reason: 'Encore', confirmName: 'Mutuelle de Dakar' });
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe('invalid_state');
    expect(await codeOf(await suspend(D, { reason: 'x', confirmName: 'Jeunesse solidaire 100% Bouaké' }))).toBe(
      'invalid_state',
    );
    expect(await codeOf(await reactivate(A.id))).toBe('invalid_state');
    expect((await row(D)).status).toBe('onboarding');
  });

  it('association inconnue : 404', async () => {
    const unknown = '00000000-0000-7000-8000-0000000015ff';
    expect((await suspend(unknown, { reason: 'x', confirmName: 'x' })).status).toBe(404);
    expect((await reactivate(unknown)).status).toBe(404);
  });

  it('effet immédiat : le gestionnaire connecté reçoit 403 association_suspended dès la requête suivante', async () => {
    const awa = await f.login('association', AWA);
    const koffi = await f.login('association', KOFFI);
    expect((await probe(A.id, awa)).status).toBe(200);

    expect((await suspend(A.id, { reason: 'Impayé', confirmName: 'Entraide Yopougon' })).status).toBe(200);
    const refused = await probe(A.id, awa);
    expect(refused.status).toBe(403);
    expect(await codeOf(refused)).toBe('association_suspended');
    // L'autre association n'est pas touchée ; un non-membre de A n'apprend rien du statut (404).
    expect((await probe(B.id, koffi)).status).toBe(200);
    expect((await probe(A.id, koffi)).status).toBe(404);
  });

  it('consommateur : sessions association des gestionnaires révoquées, jetons refusés, reconnexion refusée', async () => {
    const awa = await f.login('association', AWA);
    const awaSubscriber = await f.login('subscriber', AWA);
    const koffi = await f.login('association', KOFFI);
    expect((await suspend(A.id, { reason: 'Impayé', confirmName: 'Entraide Yopougon' })).status).toBe(200);
    await deliverSuspended(A.id);

    const revoked = await f.call('/me', { token: awa });
    expect(revoked.status).toBe(401);
    expect(await codeOf(revoked)).toBe('session_revoked');
    expect(await openSessions(USERS.awa)).toEqual({ subscriber: 1 });
    // Ni l'espace souscripteur d'Awa, ni le gestionnaire d'une autre association.
    expect((await f.call('/me', { token: awaSubscriber })).status).toBe(200);
    expect((await probe(B.id, koffi)).status).toBe(200);

    const relogin = await f.call('/auth/login', {
      method: 'POST',
      body: { space: 'association', identifier: AWA, password: 'Baobab-Lagune-2026' },
    });
    expect(relogin.status).toBe(403);
    expect(await codeOf(relogin)).toBe('association_suspended');

    // Rejoué (idempotent) : rien de plus à révoquer, aucune erreur.
    await deliverSuspended(A.id);
  });

  it('consommateur : association réactivée avant le traitement de l’événement → rien n’est révoqué', async () => {
    const awa = await f.login('association', AWA);
    expect((await suspend(A.id, { reason: 'Impayé', confirmName: 'Entraide Yopougon' })).status).toBe(200);
    expect((await reactivate(A.id)).status).toBe(200);
    await deliverSuspended(A.id);
    expect((await probe(A.id, awa)).status).toBe(200);
    expect(await openSessions(USERS.awa)).toEqual({ association: 1 });
  });

  it('gestionnaire de A (suspendue) et de B : session révoquée, reconnexion acceptée, B accessible', async () => {
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       VALUES (gen_random_uuid(), $1, $2, 'manager', 'active', now())`,
      [A.id, USERS.koffi],
    );
    try {
      const koffi = await f.login('association', KOFFI);
      expect((await suspend(A.id, { reason: 'Impayé', confirmName: 'Entraide Yopougon' })).status).toBe(200);
      await deliverSuspended(A.id);
      expect(await codeOf(await probe(B.id, koffi))).toBe('session_revoked');

      const again = await f.login('association', KOFFI);
      expect((await probe(B.id, again)).status).toBe(200);
      expect(await codeOf(await probe(A.id, again))).toBe('association_suspended');
    } finally {
      await f.h.superuser(`DELETE FROM memberships WHERE association_id = $1 AND user_id = $2`, [A.id, USERS.koffi]);
    }
  });

  it('connexion : un gestionnaire dont toutes les associations sont suspendues est refusé', async () => {
    const res = await f.call('/auth/login', {
      method: 'POST',
      body: { space: 'association', identifier: OWNERS.diop.email, password: 'Baobab-Lagune-2026' },
    });
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('association_suspended');
    // Mauvais mot de passe : toujours invalid_credentials (le statut n'est révélé qu'après le mot de passe).
    const wrong = await f.call('/auth/login', {
      method: 'POST',
      body: { space: 'association', identifier: OWNERS.diop.email, password: 'mauvais-mot-de-passe' },
    });
    expect(await codeOf(wrong)).toBe('invalid_credentials');
  });

  it('réactivation : active, date et motif effacés, audité, association.reactivated ; accès rétabli', async () => {
    const awa = await f.login('association', AWA);
    expect((await suspend(A.id, { reason: 'Impayé', confirmName: 'Entraide Yopougon' })).status).toBe(200);
    expect((await probe(A.id, awa)).status).toBe(403);
    const since = await dbNow();

    const res = await reactivate(A.id);
    expect(res.status).toBe(200);
    const detail = PlatformAssociationDetail.parse(await res.json());
    expect(detail).toMatchObject({ status: 'active', suspendedAt: null });
    expect(await lastEvent(A.id)).toMatchObject({ type: 'association.reactivated' });
    expect(await row(A.id)).toMatchObject({ status: 'active', suspended_at: null, suspension_reason: null });
    expect((await probe(A.id, awa)).status).toBe(200);
    expect((await f.login('association', AWA)).length).toBeGreaterThan(0);

    expect(await events('association.reactivated', A.id, since)).toEqual([
      expect.objectContaining({ actor_user_id: STAFF.owner.id, payload: { associationId: A.id } }),
    ]);
    expect(await audits('association.reactivate', A.id, since)).toEqual([
      expect.objectContaining({
        before: { status: 'suspended', suspensionReason: 'Impayé' },
        after: { status: 'active', suspensionReason: null },
      }),
    ]);
  });

  it('permissions : support 403, gestionnaire ou souscripteur 404, sans jeton 401', async () => {
    const body = { reason: 'Impayé', confirmName: 'Entraide Yopougon' };
    expect(await codeOf(await suspend(A.id, body, support))).toBe('forbidden');
    expect(await codeOf(await reactivate(C, support))).toBe('forbidden');
    expect((await suspend(A.id, body, await f.login('association', AWA))).status).toBe(404);
    expect((await suspend(A.id, body, await f.login('subscriber', 'fatou@test.cotiz.app'))).status).toBe(404);
    expect((await f.call(`/platform/associations/${A.id}/suspend`, { method: 'POST', body })).status).toBe(401);
    expect((await row(A.id)).status).toBe('active');
    expect((await row(C)).status).toBe('suspended');
  });
});
