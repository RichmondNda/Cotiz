import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { RefreshInstallmentStatusesUseCase } from '../../src/modules/ledger/application/refresh-installment-statuses.use-case.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';

/**
 * Lot 2.4 · étape 8 : tâche installments.refresh-statuses (jobs.yaml : quotidienne 01:00 dans le fuseau de chaque
 * association ; architecture/04 § 4.6), espace system. Statuts recalculés par installmentStatus(), date de retard par
 * lateSinceOf() (gardée sous `declared`), un événement installment.late par souscripteur et par projet pour les
 * échéances qui passent en retard ; idempotente.
 *
 * Horloge simulée : inscriptions le 2026-03-02 (toutes les échéances à venir), puis tâche à différentes dates.
 * PROJECTS.a : 25 000 F le 5 de chaque mois depuis le 2026-03-05, délai de grâce 5 jours (retard le 11).
 */

const ENROLLED_ON = new Date('2026-03-02T10:00:00Z');

describe('installments.refresh-statuses', () => {
  let f: LedgerFixture;
  let worker: INestApplicationContext;

  const run = (at: string) => worker.get(RefreshInstallmentStatusesUseCase).execute(new Date(at));
  const statuses = async (enrollmentId: string, upTo = '2026-07-31') =>
    (
      await f.h.superuser(
        `SELECT due_date::text AS "dueDate", status, late_since::text AS "lateSince" FROM installments
          WHERE enrollment_id = $1 AND due_date <= $2 ORDER BY due_date`,
        [enrollmentId, upTo],
      )
    ).rows as { dueDate: string; status: string; lateSince: string | null }[];
  const lateEvents = async () =>
    (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, aggregate_type, payload FROM outbox_events
          WHERE event_type = 'installment.late' ORDER BY id`,
      )
    ).rows as {
      association_id: string;
      actor_user_id: string | null;
      aggregate_type: string;
      payload: { userId: string; projectId: string; installmentIds: string[]; lateSince: string };
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
    await f.resetLedger();
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type = 'installment.late'`);
    await f.h.superuser(`UPDATE associations SET timezone = 'Africa/Abidjan' WHERE id = ANY($1::uuid[])`, [
      [A.id, B.id],
    ]);
  });

  const kofi = async () => {
    const { id } = await f.enrollByApi({
      phone: '+2250711223344',
      firstName: 'Kofi',
      lastName: 'Annan',
      startsFrom: '2026-03-01',
    });
    return { id, userId: await f.userOf(id) };
  };

  it('le jour J : due ; après le délai de grâce : late avec sa date, un événement ; idempotente', async () => {
    const k = await kofi();
    expect((await statuses(k.id, '2026-03-31'))[0]).toEqual({
      dueDate: '2026-03-05',
      status: 'upcoming',
      lateSince: null,
    });

    await run('2026-03-05T01:00:00Z');
    expect((await statuses(k.id, '2026-04-30')).map((s) => s.status)).toEqual(['due', 'upcoming']);
    expect(await lateEvents()).toEqual([]);

    // Dernier jour du délai (10 mars) : toujours due ; le 11 : en retard.
    await run('2026-03-10T01:00:00Z');
    expect((await statuses(k.id, '2026-03-31'))[0]?.status).toBe('due');
    await run('2026-03-11T01:00:00Z');
    expect(await statuses(k.id, '2026-04-30')).toEqual([
      { dueDate: '2026-03-05', status: 'late', lateSince: '2026-03-11' },
      { dueDate: '2026-04-05', status: 'upcoming', lateSince: null },
    ]);
    const march = await f.installmentOf(k.id, '2026-03-05');
    expect(await lateEvents()).toEqual([
      {
        association_id: A.id,
        actor_user_id: null,
        aggregate_type: 'enrollment',
        payload: { userId: k.userId, projectId: PROJECTS.a, installmentIds: [march], lateSince: '2026-03-11' },
      },
    ]);

    // Relancée (même jour ou lendemain) : rien ne change, aucun nouvel événement.
    await run('2026-03-11T01:00:00Z');
    await run('2026-03-12T01:00:00Z');
    expect(await lateEvents()).toHaveLength(1);
  });

  it('plusieurs passages en retard le même jour : un seul événement par souscripteur et par projet', async () => {
    const k = await kofi();
    const moussa = await f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-03-01' });
    await run('2026-05-11T01:00:00Z');
    const ids = await Promise.all(['2026-03-05', '2026-04-05', '2026-05-05'].map((d) => f.installmentOf(k.id, d)));
    expect((await statuses(k.id, '2026-05-31')).map((s) => [s.status, s.lateSince])).toEqual([
      ['late', '2026-03-11'],
      ['late', '2026-04-11'],
      ['late', '2026-05-11'],
    ]);
    const events = await lateEvents();
    expect(events.map((e) => e.payload.userId).sort()).toEqual([k.userId, USERS.moussa].sort());
    expect(events.find((e) => e.payload.userId === k.userId)?.payload).toEqual({
      userId: k.userId,
      projectId: PROJECTS.a,
      installmentIds: ids,
      lateSince: '2026-03-11',
    });
    expect(events.find((e) => e.payload.userId === USERS.moussa)?.payload).toEqual({
      userId: USERS.moussa,
      projectId: PROJECTS.a,
      installmentIds: await Promise.all(
        ['2026-03-05', '2026-04-05', '2026-05-05'].map((d) => f.installmentOf(moussa.id, d)),
      ),
      lateSince: '2026-03-11',
    });
    expect((await statuses(moussa.id, '2026-05-31')).every((s) => s.status === 'late')).toBe(true);
  });

  it('soldée, dispensée, déclarée ou en partie versée : statut du domaine, date de retard gardée sous declared', async () => {
    const k = await kofi();
    const [march, april, may, june] = await Promise.all(
      ['2026-03-05', '2026-04-05', '2026-05-05', '2026-06-05'].map((d) => f.installmentOf(k.id, d)),
    );
    if (!march || !april || !may || !june) throw new Error('échéances introuvables');
    await f.record({
      enrollmentId: k.id,
      userId: k.userId,
      amount: 25000,
      status: 'validated',
      declaredAt: '2026-03-04T08:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-03-04T09:00:00Z',
      lines: [{ installmentId: march, amount: 25000, state: 'confirmed' }],
    });
    await f.record({
      enrollmentId: k.id,
      userId: k.userId,
      amount: 10000,
      status: 'validated',
      declaredAt: '2026-04-04T08:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-04-04T09:00:00Z',
      lines: [{ installmentId: april, amount: 10000, state: 'confirmed' }],
    });
    await f.record({
      enrollmentId: k.id,
      userId: k.userId,
      amount: 25000,
      status: 'pending',
      declaredAt: '2026-05-04T08:00:00Z',
      lines: [{ installmentId: may, amount: 25000, state: 'proposed' }],
    });
    await f.h.superuser(`UPDATE installments SET status = 'waived' WHERE id = $1`, [june]);

    await run('2026-07-01T01:00:00Z');
    expect(await statuses(k.id, '2026-06-30')).toEqual([
      { dueDate: '2026-03-05', status: 'paid', lateSince: null },
      { dueDate: '2026-04-05', status: 'late', lateSince: '2026-04-11' },
      { dueDate: '2026-05-05', status: 'declared', lateSince: '2026-05-11' },
      { dueDate: '2026-06-05', status: 'waived', lateSince: null },
    ]);
    // Seule avril passe en retard (mai reste déclarée : l'action est côté gestionnaire).
    expect((await lateEvents()).map((e) => e.payload.installmentIds)).toEqual([[april]]);
  });

  it('fuseau de chaque association : traitée à 01:00 chez elle seulement', async () => {
    const k = await kofi();
    const fatou = await f.enrollByApi(
      { userId: USERS.fatou, startsFrom: '2026-03-01' },
      { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
    );
    // B à Paris (UTC+1 en mars) : 01:00 chez elle = 00:00 UTC.
    await f.h.superuser(`UPDATE associations SET timezone = 'Europe/Paris' WHERE id = $1`, [B.id]);

    await run('2026-03-20T01:00:00Z');
    expect((await statuses(k.id, '2026-03-31'))[0]?.status).toBe('late');
    expect((await statuses(fatou.id, '2026-03-31'))[0]?.status).toBe('upcoming');

    await run('2026-03-21T00:00:00Z');
    expect((await statuses(fatou.id, '2026-03-31'))[0]?.status).toBe('late');
    expect((await lateEvents()).map((e) => e.association_id)).toEqual([A.id, B.id]);
  });

  it('en même temps qu’une validation : aucun interblocage (projet, puis échéances par id), soldes et statuts justes', async () => {
    const k = await kofi();
    const [march, april] = await Promise.all(['2026-03-05', '2026-04-05'].map((d) => f.installmentOf(k.id, d)));
    if (!march || !april) throw new Error('échéances introuvables');
    const pay = await f.record({
      enrollmentId: k.id,
      userId: k.userId,
      amount: 50000,
      status: 'pending',
      declaredAt: '2026-03-01T08:00:00Z',
      lines: [
        { installmentId: march, amount: 25000, state: 'proposed' },
        { installmentId: april, amount: 25000, state: 'proposed' },
      ],
    });
    const holder = new pg.Client({ connectionString: f.h.db.superuserUrl });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [PROJECTS.a]);
      const validation = f.call(`/associations/${A.id}/payments/${pay}/validate`, {
        token: f.tokens.awa,
        method: 'POST',
        body: {},
        headers: { 'idempotency-key': crypto.randomUUID(), 'if-match': 'W/"1"' },
      });
      const job = run('2026-05-11T01:00:00Z');
      let waiting = 0;
      for (let i = 0; i < 400 && waiting < 2; i += 1) {
        const { rowCount } = await f.h.superuser(
          `SELECT 1 FROM pg_stat_activity
            WHERE usename = 'cotiz_app' AND datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`,
        );
        waiting = rowCount ?? 0;
        if (waiting >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      // Les deux attendent le projet : la concurrence est certaine.
      expect(waiting).toBe(2);
      await holder.query('COMMIT');
      expect((await validation).status).toBe(200);
      await job;
    } finally {
      await holder.end();
    }
    // Mars et avril soldées quel que soit l'ordre ; mai en retard (la tâche, ou la suivante, l'a vue).
    await run('2026-05-11T01:00:00Z');
    expect((await statuses(k.id, '2026-05-31')).map((s) => s.status)).toEqual(['paid', 'paid', 'late']);
    // Un seul événement pour mai, même relancée.
    expect(await lateEvents()).toHaveLength(1);
  });
});
