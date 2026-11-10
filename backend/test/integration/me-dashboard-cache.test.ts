import { ENDPOINTS, type EventEnvelope, type EventType } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SUBSCRIBER_DASHBOARD_EVENTS,
  SubscriberDashboardCacheConsumer,
} from '../../src/modules/reporting/events/subscriber-dashboard-cache.consumer.js';
import { EventConsumers } from '../../src/shared/outbox/index.js';
import { TenantDatabase } from '../../src/shared/tenant-context/index.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';

/**
 * Lot 3.2 · étape 1 : tableau de bord souscripteur en cache 30 s (architecture/09), invalidé par les événements qui
 * concernent la personne (consommateur du worker, branché ici sur les vrais abonnements).
 * Horloge : 2026-11-08 10:00 UTC. PROJECTS.a : 25 000 F le 5 de chaque mois, du 2026-03-01 au 2027-08-31.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Dashboard = ENDPOINTS['me.dash'].operations.get.response.body;

describe('me.dash : invalidation du cache par événement', () => {
  let f: LedgerFixture;
  let consumers: EventConsumers;
  let consumer: SubscriberDashboardCacheConsumer;

  const dashboardOf = async () => {
    const res = await f.call('/me/dashboard', { token: f.tokens.moussa });
    expect(res.status).toBe(200);
    return Dashboard.parse(await res.json());
  };
  const deliver = async (type: EventType, payload: Record<string, unknown>, associationId = A.id) => {
    const event: EventEnvelope = {
      id: '1',
      type,
      version: 1,
      occurredAt: new Date().toISOString(),
      associationId,
      actorUserId: USERS.awa,
      aggregate: { type: 'payment', id: crypto.randomUUID() },
      payload,
    };
    for (const handler of consumers.for(type)) await handler.handle(event);
  };
  /** Écriture directe en base, sans événement : un paiement validé de Moussa sur l'échéance de novembre. */
  const validatedDirectly = async (enrollmentId: string) =>
    f.record({
      enrollmentId,
      userId: USERS.moussa,
      amount: 25000,
      status: 'validated',
      declaredAt: '2026-11-03T09:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-11-03T15:00:00Z',
      lines: [{ installmentId: await f.installmentOf(enrollmentId, '2026-11-05'), amount: 25000, state: 'confirmed' }],
    });
  const moussaOnA = () =>
    f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-03-01' }, { aid: A.id, pid: PROJECTS.a });

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startLedgerFixture();
    consumers = new EventConsumers();
    consumer = new SubscriberDashboardCacheConsumer(consumers, f.app.get(TenantDatabase), f.config);
    consumer.onModuleInit();
  });

  afterAll(async () => {
    consumer.onModuleDestroy();
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await f.resetLedger();
    await f.redis.exec(['redis-cli', 'FLUSHALL']);
  });

  it('sans événement, l’entrée en cache est servie (écriture directe invisible)', async () => {
    const moussa = await moussaOnA();
    const before = await dashboardOf();
    await validatedDirectly(moussa.id);
    expect(await dashboardOf()).toEqual(before);
  });

  it('événement qui nomme la personne (payment.validated) : recalculé', async () => {
    const moussa = await moussaOnA();
    const before = await dashboardOf();
    await validatedDirectly(moussa.id);
    await deliver('payment.validated', { paymentId: crypto.randomUUID(), userId: USERS.moussa });
    const after = await dashboardOf();
    expect(after.remainingTotal.amount).toBe(before.remainingTotal.amount - 25000);
    expect(after.recentPayments).toHaveLength(1);
  });

  it('événement d’une autre personne : rien n’est invalidé', async () => {
    const moussa = await moussaOnA();
    const before = await dashboardOf();
    await validatedDirectly(moussa.id);
    await deliver('payment.validated', { paymentId: crypto.randomUUID(), userId: USERS.fatou });
    expect(await dashboardOf()).toEqual(before);
  });

  it('payment.reverted (sans personne) : la personne est relue sur le paiement', async () => {
    const moussa = await moussaOnA();
    await dashboardOf();
    const paymentId = await validatedDirectly(moussa.id);
    await deliver('payment.reverted', { paymentId, revertedBy: USERS.awa });
    expect((await dashboardOf()).recentPayments.map((p) => p.id)).toEqual([paymentId]);
  });

  it('member.withdrawn (sans personne) : la personne est relue sur l’inscription', async () => {
    const moussa = await moussaOnA();
    expect((await dashboardOf()).projectsCount).toBe(1);
    await f.h.superuser(`UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1`, [moussa.id]);
    await deliver('member.withdrawn', { enrollmentId: moussa.id, reason: 'test' });
    expect((await dashboardOf()).projectsCount).toBe(0);
  });

  it('association.suspended puis reactivated (sans personne) : ses souscripteurs sont recalculés, marqués', async () => {
    await moussaOnA();
    expect((await dashboardOf()).projects.map((c) => c.association.suspended)).toEqual([false]);
    try {
      await f.h.superuser(`UPDATE associations SET status = 'suspended' WHERE id = $1`, [A.id]);
      expect((await dashboardOf()).projects.map((c) => c.association.suspended)).toEqual([false]);
      await deliver('association.suspended', { associationId: A.id, reason: 'test' });
      expect((await dashboardOf()).projects.map((c) => c.association.suspended)).toEqual([true]);
      await f.h.superuser(`UPDATE associations SET status = 'active' WHERE id = $1`, [A.id]);
      await deliver('association.reactivated', { associationId: A.id });
      expect((await dashboardOf()).projects.map((c) => c.association.suspended)).toEqual([false]);
    } finally {
      await f.h.superuser(`UPDATE associations SET status = 'active' WHERE id = $1`, [A.id]);
    }
  });

  it('association.suspended d’une autre association : rien n’est invalidé chez ses non-souscripteurs', async () => {
    const moussa = await moussaOnA();
    const { rows } = await f.h.superuser(
      `SELECT count(*)::int AS n FROM memberships WHERE association_id = $1 AND user_id = $2 AND status = 'active'`,
      [B.id, USERS.moussa],
    );
    expect(rows[0]).toEqual({ n: 0 });
    const before = await dashboardOf();
    await validatedDirectly(moussa.id);
    // Politique élargie : seul le filtre du code garde l'invalidation dans l'association de l'événement.
    await f.h.withPolicy('memberships', 'tenant_isolation', { using: 'true', withCheck: null }, () =>
      deliver('association.suspended', { associationId: B.id, reason: 'test' }, B.id),
    );
    expect(await dashboardOf()).toEqual(before);
  });

  it('événements écoutés : exactement ceux qui changent les chiffres de la personne', () => {
    expect([...SUBSCRIBER_DASHBOARD_EVENTS].sort()).toEqual(
      [
        'member.enrolled',
        'member.withdrawn',
        'payment.declared',
        'payment.validated',
        'payment.rejected',
        'payment.reverted',
        'installment.late',
        'user.activated',
        'team.changed',
        'association.suspended',
        'association.reactivated',
      ].sort(),
    );
    for (const type of SUBSCRIBER_DASHBOARD_EVENTS) expect(consumers.for(type)).toHaveLength(1);
  });

  it('payment.rejected : recalculé (le retard revient)', async () => {
    const moussa = await moussaOnA();
    const before = await dashboardOf();
    await validatedDirectly(moussa.id);
    await deliver('payment.rejected', { paymentId: crypto.randomUUID(), userId: USERS.moussa });
    expect((await dashboardOf()).recentPayments).toHaveLength(before.recentPayments.length + 1);
  });
});
