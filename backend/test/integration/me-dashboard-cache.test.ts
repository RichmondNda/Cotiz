import { ENDPOINTS, type EventEnvelope, type EventType } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SUBSCRIBER_DASHBOARD_EVENTS,
  SubscriberDashboardCacheConsumer,
} from '../../src/modules/reporting/events/subscriber-dashboard-cache.consumer.js';
import { EventConsumers } from '../../src/shared/outbox/index.js';
import { TenantDatabase } from '../../src/shared/tenant-context/index.js';
import { A, USERS } from '../isolation/harness.js';
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
  const deliver = async (type: EventType, payload: Record<string, unknown>) => {
    const event: EventEnvelope = {
      id: '1',
      type,
      version: 1,
      occurredAt: new Date().toISOString(),
      associationId: A.id,
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

  it('événements écoutés : ceux qui changent les chiffres de la personne', () => {
    for (const type of ['member.enrolled', 'payment.declared', 'payment.validated', 'installment.late'] as const) {
      expect(SUBSCRIBER_DASHBOARD_EVENTS).toContain(type);
      expect(consumers.for(type)).toHaveLength(1);
    }
  });
});
