import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { EventEnvelope, EventType } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { SendDueSoonRemindersUseCase } from '../../src/modules/ledger/application/send-due-soon-reminders.use-case.js';
import { NotificationsConsumer } from '../../src/modules/notifications/events/notifications.consumer.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';

/**
 * Lot 2.5 · étape 4 : tâche installments.due-soon (jobs.yaml : quotidienne 08:00 locale ; architecture/07 « échéance
 * dans 3 jours »), espace system, puis cloche du souscripteur par le consommateur notifications.
 *
 * Horloge simulée : inscriptions le 2026-03-01, tâche à différentes heures. PROJECTS.a : 25 000 F le 5 de chaque mois
 * depuis le 2026-03-05 ; Abidjan = UTC, donc 08:00Z le 2 mars vise les échéances du 5 mars.
 */

const ENROLLED_ON = new Date('2026-03-01T10:00:00Z');
const THIN = String.fromCharCode(0x202f);
const NBSP = String.fromCharCode(0xa0);

interface OutboxRow {
  id: string;
  event_type: EventType;
  association_id: string | null;
  actor_user_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  payload: { userId: string; projectId: string; installmentIds: string[]; dueDate: string };
  occurred_at: Date;
}

describe('installments.due-soon', () => {
  let f: LedgerFixture;
  let worker: INestApplicationContext;

  const run = (at: string) => worker.get(SendDueSoonRemindersUseCase).execute(new Date(at));
  const events = async () =>
    (
      await f.h.superuser(
        `SELECT id::text, event_type, association_id, actor_user_id, aggregate_type, aggregate_id, payload, occurred_at
           FROM outbox_events WHERE event_type = 'installment.due_soon' ORDER BY id`,
      )
    ).rows as OutboxRow[];
  /** Les événements de la tâche passés au consommateur, comme le relais de l'outbox. */
  const deliver = async (rows: OutboxRow[]) => {
    const consumer = worker.get(NotificationsConsumer);
    for (const r of rows) {
      const envelope: EventEnvelope = {
        id: r.id,
        type: r.event_type,
        version: 1,
        occurredAt: r.occurred_at.toISOString(),
        associationId: r.association_id,
        actorUserId: r.actor_user_id,
        aggregate: { type: r.aggregate_type, id: r.aggregate_id },
        payload: r.payload,
      };
      await consumer.handle(envelope);
    }
  };
  const bells = async () =>
    (
      await f.h.superuser(
        `SELECT user_id, association_id, type, title, body, action_url, data FROM notifications ORDER BY user_id`,
      )
    ).rows as {
      user_id: string;
      association_id: string;
      type: string;
      title: string;
      body: string;
      action_url: string;
      data: Record<string, unknown>;
    }[];

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: ENROLLED_ON });
    f = await startLedgerFixture();
    worker = await NestFactory.createApplicationContext(
      WorkerModule.register(
        loadConfig({
          NODE_ENV: 'test',
          DATABASE_URL: f.h.db.urlFor('cotiz_app'),
          REDIS_URL: f.redis.getConnectionUrl(),
          S3_ENDPOINT: 'http://127.0.0.1:1',
          OUTBOX_RELAY_INTERVAL_MS: '0',
        }),
      ),
      { logger: false },
    );
  });

  afterAll(async () => {
    await worker.close();
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.setSystemTime(ENROLLED_ON);
    // Avant la remise à zéro : une notification retient le compte créé par une inscription.
    await f.h.superuser('DELETE FROM notifications');
    await f.resetLedger();
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type = 'installment.due_soon'`);
    await f.h.superuser(`UPDATE associations SET timezone = 'Africa/Abidjan' WHERE id = ANY($1::uuid[])`, [
      [A.id, B.id],
    ]);
  });

  const moussa = () => f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-03-01' });

  it('à 08:00 locale, J-3 : un événement par souscripteur et par projet, puis une cloche « échéance dans 3 jours »', async () => {
    const m = await moussa();
    const march = await f.installmentOf(m.id, '2026-03-05');

    // 07:00 : pas encore l'heure ; le 1er mars à 08:00 : J-4, rien à rappeler.
    await run('2026-03-02T07:00:00Z');
    await run('2026-03-01T08:00:00Z');
    expect(await events()).toEqual([]);

    await run('2026-03-02T08:00:00Z');
    const [event, ...others] = await events();
    expect(others).toEqual([]);
    expect(event).toMatchObject({
      association_id: A.id,
      actor_user_id: null,
      aggregate_type: 'enrollment',
      aggregate_id: m.id,
      payload: { userId: USERS.moussa, projectId: PROJECTS.a, installmentIds: [march], dueDate: '2026-03-05' },
    });

    await deliver(await events());
    expect(await bells()).toEqual([
      {
        user_id: USERS.moussa,
        association_id: A.id,
        type: 'installment.due_soon',
        title: 'Échéance dans 3 jours',
        body: `Prochaine échéance le 5 mars : 25${THIN}000${NBSP}F pour Centre communautaire.`,
        action_url: `/paiements/declarer?projet=${PROJECTS.a}`,
        data: { audience: 'subscriber', actionLabel: 'Déclarer un paiement', projectId: PROJECTS.a },
      },
    ]);
  });

  it('relancée le même jour : republiée, mais une seule cloche', async () => {
    await moussa();
    await run('2026-03-02T08:00:00Z');
    await run('2026-03-02T08:00:00Z');
    expect(await events()).toHaveLength(2);
    await deliver(await events());
    expect(await bells()).toHaveLength(1);
  });

  it('échéance déjà déclarée (en attente) ou soldée : aucun rappel', async () => {
    const m = await moussa();
    const april = await f.installmentOf(m.id, '2026-04-05');
    const may = await f.installmentOf(m.id, '2026-05-05');
    await f.record({
      enrollmentId: m.id,
      userId: USERS.moussa,
      associationId: A.id,
      projectId: PROJECTS.a,
      amount: 25_000,
      status: 'pending',
      declaredAt: '2026-03-20T09:00:00Z',
      lines: [{ installmentId: april, amount: 25_000, state: 'proposed' }],
    });
    await f.record({
      enrollmentId: m.id,
      userId: USERS.moussa,
      associationId: A.id,
      projectId: PROJECTS.a,
      amount: 25_000,
      status: 'validated',
      declaredAt: '2026-03-20T09:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-03-21T09:00:00Z',
      amountReceived: 25_000,
      lines: [{ installmentId: may, amount: 25_000, state: 'confirmed' }],
    });
    await run('2026-04-02T08:00:00Z');
    await run('2026-05-02T08:00:00Z');
    expect(await events()).toEqual([]);
  });

  it('déclarée entre la tâche et la notification : reste dû relu, pas de cloche', async () => {
    const m = await moussa();
    const march = await f.installmentOf(m.id, '2026-03-05');
    await run('2026-03-02T08:00:00Z');
    await f.record({
      enrollmentId: m.id,
      userId: USERS.moussa,
      associationId: A.id,
      projectId: PROJECTS.a,
      amount: 25_000,
      status: 'pending',
      declaredAt: '2026-03-02T09:00:00Z',
      lines: [{ installmentId: march, amount: 25_000, state: 'proposed' }],
    });
    await deliver(await events());
    expect(await bells()).toEqual([]);
  });

  it('fuseau de chaque association : 08:00 locale, pas 08:00 UTC', async () => {
    await moussa();
    await f.h.superuser(`UPDATE associations SET timezone = 'Europe/Paris' WHERE id = $1`, [A.id]);
    // 2 mars 08:00Z = 09:00 à Paris : rien ; 07:00Z = 08:00 à Paris : le rappel.
    await run('2026-03-02T08:00:00Z');
    expect(await events()).toEqual([]);
    await run('2026-03-02T07:00:00Z');
    expect(await events()).toHaveLength(1);
  });

  it('deux associations, deux souscripteurs du même projet : chaque événement reste dans son association, une cloche par personne', async () => {
    const fatou = await f.enrollByApi(
      { userId: USERS.fatou, startsFrom: '2026-03-01' },
      { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
    );
    const m = await moussa();
    const kofi = await f.enrollByApi({
      phone: '+2250711223344',
      firstName: 'Kofi',
      lastName: 'Annan',
      startsFrom: '2026-03-01',
    });
    const kofiUser = await f.userOf(kofi.id);
    await run('2026-03-02T08:00:00Z');
    const byUser = new Map((await events()).map((e) => [e.payload.userId, e]));
    expect(byUser.size).toBe(3);
    expect(byUser.get(USERS.fatou)).toMatchObject({
      association_id: B.id,
      payload: { projectId: PROJECTS.b, installmentIds: [await f.installmentOf(fatou.id, '2026-03-05')] },
    });
    expect(byUser.get(USERS.moussa)).toMatchObject({
      association_id: A.id,
      payload: { projectId: PROJECTS.a, installmentIds: [await f.installmentOf(m.id, '2026-03-05')] },
    });
    expect(byUser.get(kofiUser)).toMatchObject({
      association_id: A.id,
      payload: { projectId: PROJECTS.a, installmentIds: [await f.installmentOf(kofi.id, '2026-03-05')] },
    });

    await deliver(await events());
    const bellsOf = (await bells()).map((b) => [b.user_id, b.association_id]);
    expect(bellsOf).toContainEqual([USERS.moussa, A.id]);
    expect(bellsOf).toContainEqual([USERS.fatou, B.id]);
    expect(new Set(bellsOf.map(([u]) => u)).size).toBe(bellsOf.length);
  });

  it('paiement partiel en attente : le rappel annonce le reste dû', async () => {
    const m = await moussa();
    const march = await f.installmentOf(m.id, '2026-03-05');
    await f.record({
      enrollmentId: m.id,
      userId: USERS.moussa,
      associationId: A.id,
      projectId: PROJECTS.a,
      amount: 10_000,
      status: 'pending',
      declaredAt: '2026-03-01T12:00:00Z',
      lines: [{ installmentId: march, amount: 10_000, state: 'proposed' }],
    });
    await run('2026-03-02T08:00:00Z');
    await deliver(await events());
    expect((await bells()).map((b) => b.body)).toEqual([
      `Prochaine échéance le 5 mars : 15${THIN}000${NBSP}F pour Centre communautaire.`,
    ]);
  });

  it('échéance dispensée ou inscription retirée : aucun rappel', async () => {
    const m = await moussa();
    await f.h.superuser(`UPDATE installments SET status = 'waived' WHERE id = $1`, [
      await f.installmentOf(m.id, '2026-03-05'),
    ]);
    await run('2026-03-02T08:00:00Z');
    expect(await events()).toEqual([]);

    // Inscription retirée avec une échéance future encore ouverte (en partie versée : le retrait ne l'annule pas).
    await run('2026-04-02T08:00:00Z');
    const pending = await events();
    expect(pending).toHaveLength(1);
    await f.h.superuser(`UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1`, [m.id]);
    await deliver(pending);
    expect(await bells()).toEqual([]);
    await run('2026-04-02T08:00:00Z');
    expect(await events()).toHaveLength(1);
  });

  it('appartenance retirée entre la tâche et la notification : pas de cloche', async () => {
    await moussa();
    await run('2026-03-02T08:00:00Z');
    await f.h.superuser(
      `UPDATE memberships SET status = 'removed', removed_at = now() WHERE association_id = $1 AND user_id = $2`,
      [A.id, USERS.moussa],
    );
    try {
      await deliver(await events());
      expect(await bells()).toEqual([]);
    } finally {
      await f.h.superuser(
        `UPDATE memberships SET status = 'active', removed_at = NULL WHERE association_id = $1 AND user_id = $2`,
        [A.id, USERS.moussa],
      );
    }
  });

  it('isolation : un événement de A ne notifie ni un souscripteur de B, ni pour des échéances de B', async () => {
    const fatou = await f.enrollByApi(
      { userId: USERS.fatou, startsFrom: '2026-03-01' },
      { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
    );
    const fatouMarch = await f.installmentOf(fatou.id, '2026-03-05');
    const m = await moussa();
    const consumer = worker.get(NotificationsConsumer);
    let seq = 9_000_000;
    const forged = (userId: string, projectId: string, installmentIds: string[]): EventEnvelope => ({
      id: String(++seq),
      type: 'installment.due_soon',
      version: 1,
      occurredAt: new Date().toISOString(),
      associationId: A.id,
      actorUserId: null,
      aggregate: { type: 'enrollment', id: m.id },
      payload: { userId, projectId, installmentIds, dueDate: '2026-03-05' },
    });
    // Souscriptrice de B seulement, dans un événement de A.
    await consumer.handle(forged(USERS.fatou, PROJECTS.b, [fatouMarch]));
    // Moussa (A), mais échéance ou projet de B : illisibles dans le contexte de A, reste dû nul.
    await consumer.handle(forged(USERS.moussa, PROJECTS.b, [fatouMarch]));
    await consumer.handle(forged(USERS.moussa, PROJECTS.a, [fatouMarch]));
    expect(await bells()).toEqual([]);
  });
});
