import { PlatformAssociationDetail, PlatformSubscription } from '@cotiz/contracts';
import { todayIn } from '@cotiz/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import {
  C,
  codeOf,
  type PlatformFixture,
  PLANS,
  STAFF,
  startPlatformFixture,
  SUBS,
} from './platform-associations.fixture.js';

/**
 * Lot 1.4 · étape 4 : changement de plan d'une association (pf.asso.plan). Vérification de l'étape : `quota_exceeded`
 * testé. Effet immédiat (date d'effet = aujourd'hui, Africa/Abidjan) sur l'abonnement en cours ; refus si l'usage
 * dépasse les quotas du nouveau plan ; surcharge des comptes gestionnaires conservée. Audité,
 * subscription.plan_changed.
 */

/** Plans de test : petits quotas, et un plan archivé. */
const SMALL = {
  oneSubscriber: '00000000-0000-7000-8000-0000000015e1',
  twoSubscribers: '00000000-0000-7000-8000-0000000015e2',
  oneManager: '00000000-0000-7000-8000-0000000015e3',
  threeManagers: '00000000-0000-7000-8000-0000000015e4',
  archived: '00000000-0000-7000-8000-0000000015e5',
};

describe('changement de plan d’une association (pf.asso.plan)', () => {
  let f: PlatformFixture;
  let owner: string;
  let support: string;
  const today = () => todayIn('Africa/Abidjan');

  const changePlan = (id: string, body: unknown, token = owner) =>
    f.call(`/platform/associations/${id}/change-plan`, { token, method: 'POST', body });
  const dbNow = async () => ((await f.h.superuser(`SELECT clock_timestamp() AS t`)).rows as [{ t: Date }])[0].t;
  const subscription = async (id: string) =>
    (
      await f.h.superuser(
        `SELECT plan_id, billing_period, status, manager_seats_override FROM subscriptions WHERE id = $1`,
        [id],
      )
    ).rows[0] as Record<string, unknown>;
  const events = async (id: string, since: Date) =>
    (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, aggregate_type, aggregate_id, payload FROM outbox_events
          WHERE event_type = 'subscription.plan_changed' AND association_id = $1 AND occurred_at >= $2 ORDER BY id`,
        [id, since],
      )
    ).rows as Record<string, unknown>[];
  const audits = async (id: string, since: Date) =>
    (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, entity_type, before, after FROM audit_logs
          WHERE action = 'subscription.change_plan' AND association_id = $1 AND occurred_at >= $2 ORDER BY id`,
        [id, since],
      )
    ).rows as Record<string, unknown>[];

  beforeAll(async () => {
    f = await startPlatformFixture();
    await f.h.superuser(
      `INSERT INTO plans (id, code, name, price_monthly, price_yearly, max_projects, max_subscribers, max_managers,
         features, is_active) VALUES
         ($1, 'un-souscripteur', 'Un souscripteur', 1000, 12000, 1, 1, 5, '{}', true),
         ($2, 'deux-souscripteurs', 'Deux souscripteurs', 2000, 24000, 1, 2, 5, '{}', true),
         ($3, 'un-gestionnaire', 'Un gestionnaire', 3000, 36000, NULL, NULL, 1, '{}', true),
         ($4, 'trois-gestionnaires', 'Trois gestionnaires', 4000, 48000, NULL, NULL, 3, '{}', true),
         ($5, 'archive', 'Archivé', 5000, 60000, NULL, NULL, NULL, '{}', false)`,
      [SMALL.oneSubscriber, SMALL.twoSubscribers, SMALL.oneManager, SMALL.threeManagers, SMALL.archived],
    );
    owner = await f.login('platform', STAFF.owner.email);
    support = await f.login('platform', STAFF.support.email);
  });

  afterAll(() => f.stop());

  beforeEach(async () => {
    await f.h.superuser(
      `UPDATE subscriptions SET plan_id = $1, billing_period = 'monthly', manager_seats_override = NULL,
              status = 'active' WHERE id = $2`,
      [PLANS.essentiel, SUBS.a],
    );
    await f.h.superuser(
      `UPDATE subscriptions SET plan_id = $1, billing_period = 'yearly', manager_seats_override = 3,
              status = 'trialing' WHERE id = $2`,
      [PLANS.pro, SUBS.b],
    );
  });

  it('effet immédiat : plan de l’abonnement en cours changé, abonnement renvoyé, audité, événement', async () => {
    const since = await dbNow();
    const res = await changePlan(A.id, { planId: PLANS.pro, effectiveOn: today() });
    expect(res.status).toBe(200);
    const body = PlatformSubscription.parse(await res.json());
    expect(body).toMatchObject({
      id: SUBS.a,
      plan: { id: PLANS.pro, code: 'pro', name: 'Pro' },
      billingPeriod: 'monthly',
      status: 'active',
      price: { amount: 25000, currency: 'XOF' },
      managerSeatsOverride: null,
    });
    expect(await subscription(SUBS.a)).toMatchObject({ plan_id: PLANS.pro, billing_period: 'monthly' });
    // Isolation : l'abonnement de B, ses événements et son journal ne bougent pas.
    expect(await subscription(SUBS.b)).toMatchObject({ plan_id: PLANS.pro, manager_seats_override: 3 });
    expect(await events(B.id, since)).toEqual([]);
    expect(await audits(B.id, since)).toEqual([]);

    const [event, ...more] = await events(A.id, since);
    expect(more).toEqual([]);
    expect(event).toMatchObject({
      association_id: A.id,
      actor_user_id: STAFF.owner.id,
      aggregate_type: 'subscription',
      aggregate_id: SUBS.a,
      payload: { associationId: A.id, fromPlanId: PLANS.essentiel, toPlanId: PLANS.pro },
    });
    const effectiveAt = (event?.payload as { effectiveAt: string }).effectiveAt;
    expect(new Date(effectiveAt).getTime()).toBeGreaterThanOrEqual(since.getTime());

    expect(await audits(A.id, since)).toEqual([
      expect.objectContaining({
        actor_user_id: STAFF.owner.id,
        entity_type: 'subscription',
        // Le journal ne garde que les champs modifiés.
        before: { planId: PLANS.essentiel },
        after: { planId: PLANS.pro },
      }),
    ]);
    const detail = PlatformAssociationDetail.parse(
      await (await f.call(`/platform/associations/${A.id}`, { token: owner })).json(),
    );
    expect(detail.events[0]).toMatchObject({ type: 'plan.changed' });
    expect(detail.subscription.plan.id).toBe(PLANS.pro);
  });

  it('période de facturation changée avec le plan ; même plan, autre période : accepté', async () => {
    const res = await changePlan(A.id, { planId: PLANS.essentiel, effectiveOn: today(), billingPeriod: 'yearly' });
    expect(res.status).toBe(200);
    expect(PlatformSubscription.parse(await res.json())).toMatchObject({
      billingPeriod: 'yearly',
      price: { amount: 120000, currency: 'XOF' },
    });
  });

  it('rien ne change (même plan, même période) : 409 invalid_state', async () => {
    const res = await changePlan(A.id, { planId: PLANS.essentiel, effectiveOn: today(), billingPeriod: 'monthly' });
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe('invalid_state');
  });

  it('quota_exceeded : souscripteurs au-delà du nouveau plan (409, limit et usage), rien ne change', async () => {
    const since = await dbNow();
    // A : Moussa et Aminata souscripteurs, Fatou retirée (non comptée).
    const res = await changePlan(A.id, { planId: SMALL.oneSubscriber, effectiveOn: today() });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'quota_exceeded', limit: 1, usage: 2 });
    expect(await subscription(SUBS.a)).toMatchObject({ plan_id: PLANS.essentiel });
    expect(await events(A.id, since)).toEqual([]);
    expect(await audits(A.id, since)).toEqual([]);

    // Usage égal à la limite : accepté.
    expect((await changePlan(A.id, { planId: SMALL.twoSubscribers, effectiveOn: today() })).status).toBe(200);
  });

  it('quota_exceeded : gestionnaires invités ou actifs au-delà du nouveau plan', async () => {
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status) VALUES (gen_random_uuid(), $1, $2,
         'manager', 'invited')`,
      [A.id, USERS.koffi],
    );
    try {
      const res = await changePlan(A.id, { planId: SMALL.oneManager, effectiveOn: today() });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: 'quota_exceeded', limit: 1, usage: 2 });
    } finally {
      await f.h.superuser(`DELETE FROM memberships WHERE association_id = $1 AND user_id = $2`, [A.id, USERS.koffi]);
    }
    expect((await changePlan(A.id, { planId: SMALL.oneManager, effectiveOn: today() })).status).toBe(200);
  });

  it('surcharge des comptes gestionnaires conservée (et appliquée au contrôle des quotas)', async () => {
    // B : surcharge 3 ; le plan « un gestionnaire » n'en autorise qu'un, la surcharge s'applique.
    const res = await changePlan(B.id, { planId: SMALL.oneManager, effectiveOn: today() });
    expect(res.status).toBe(200);
    expect(PlatformSubscription.parse(await res.json())).toMatchObject({
      billingPeriod: 'yearly',
      status: 'trialing',
      managerSeatsOverride: 3,
    });
    expect(await subscription(SUBS.b)).toMatchObject({ plan_id: SMALL.oneManager, manager_seats_override: 3 });
  });

  it('surcharge égale au nouveau plan : retirée (le plan s’applique)', async () => {
    const res = await changePlan(B.id, { planId: SMALL.threeManagers, effectiveOn: today() });
    expect(res.status).toBe(200);
    expect(PlatformSubscription.parse(await res.json()).managerSeatsOverride).toBeNull();
  });

  it('date d’effet autre qu’aujourd’hui : 422 effectiveOn', async () => {
    for (const effectiveOn of ['2020-01-01', '2099-12-31']) {
      const res = await changePlan(A.id, { planId: PLANS.pro, effectiveOn });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ code: 'validation_failed', fields: { effectiveOn: 'must_be_today' } });
    }
    expect(await subscription(SUBS.a)).toMatchObject({ plan_id: PLANS.essentiel });
  });

  it('plan archivé ou inconnu : 422 planId', async () => {
    for (const planId of [SMALL.archived, '00000000-0000-7000-8000-0000000015ef']) {
      const res = await changePlan(A.id, { planId, effectiveOn: today() });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ code: 'validation_failed', fields: { planId: 'unavailable' } });
    }
  });

  it('sans abonnement en cours : 409 invalid_state ; association inconnue : 404', async () => {
    await f.h.superuser(`UPDATE subscriptions SET status = 'suspended' WHERE id = $1`, [SUBS.a]);
    const res = await changePlan(A.id, { planId: PLANS.pro, effectiveOn: today() });
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe('invalid_state');
    expect(
      (await changePlan('00000000-0000-7000-8000-0000000015ff', { planId: PLANS.pro, effectiveOn: today() })).status,
    ).toBe(404);
  });

  it('association suspendue avec un abonnement en cours : le plan peut changer', async () => {
    expect((await changePlan(C, { planId: PLANS.pro, effectiveOn: today() })).status).toBe(200);
  });

  it('permissions : support 403, gestionnaire ou souscripteur 404, sans jeton 401', async () => {
    const body = { planId: PLANS.pro, effectiveOn: today() };
    expect(await codeOf(await changePlan(A.id, body, support))).toBe('forbidden');
    expect((await changePlan(A.id, body, await f.login('association', 'awa@test.cotiz.app'))).status).toBe(404);
    expect((await changePlan(A.id, body, await f.login('subscriber', 'fatou@test.cotiz.app'))).status).toBe(404);
    expect((await f.call(`/platform/associations/${A.id}/change-plan`, { method: 'POST', body })).status).toBe(401);
    expect(await subscription(SUBS.a)).toMatchObject({ plan_id: PLANS.essentiel });
  });
});
