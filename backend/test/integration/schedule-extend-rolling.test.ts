import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { ExtendRollingSchedulesUseCase } from '../../src/modules/members/application/extend-rolling-schedules.use-case.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type MembersFixture, PROJECTS, startMembersFixture } from './members.fixture.js';

/**
 * Tâche schedule.extend-rolling (jobs.yaml : mensuelle, lot 2.3), espace system : chaque inscription en cours d'un
 * cycle roulant retrouve 12 échéances datées d'aujourd'hui ou plus tard (extendRollingSchedule de @cotiz/domain),
 * sans trou de numérotation ; inscriptions retirées, projets clos et dates fixes inchangés. Idempotente.
 *
 * Horloge : inscriptions le 2026-03-02 (12 échéances, du 2026-03-05 au 2027-02-05), puis tâche au 2026-06-10 et au
 * 2027-06-10.
 */

const ENROLLED_ON = new Date('2026-03-02T10:00:00Z');
const Created = ENDPOINTS['en.create'].operations.create.response.body;
const NEW = { kofi: '+2250711223344', ama: '+2250722334455', yao: '+2250733445566' } as const;
const CLOSED_ROLLING = '00000000-0000-7000-8000-00000000c3f1';
const ROLLING_B = '00000000-0000-7000-8000-00000000c3f2';

describe('schedule.extend-rolling', () => {
  let f: MembersFixture;
  let worker: INestApplicationContext;

  const enroll = async (pid: string, body: unknown, options: { aid?: string; token?: string } = {}) => {
    const res = await f.call(`/associations/${options.aid ?? A.id}/projects/${pid}/enrollments`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body,
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(res.status).toBe(201);
    return Created.parse(await res.json()).enrollment.id;
  };
  const lines = async (enrollmentId: string) =>
    (
      await f.h.superuser(
        `SELECT sequence, due_date::text AS "dueDate", amount_due::int AS "amountDue", status
           FROM installments WHERE enrollment_id = $1 AND kind = 'periodic' ORDER BY sequence`,
        [enrollmentId],
      )
    ).rows as { sequence: number; dueDate: string; amountDue: number; status: string }[];
  const run = (at: string) => worker.get(ExtendRollingSchedulesUseCase).execute(new Date(at));

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: ENROLLED_ON });
    f = await startMembersFixture();
    await f.h.superuser(
      `INSERT INTO projects (id, association_id, name, description, status, installment_amount, frequency, due_day,
                             schedule_type, start_date, created_by)
       VALUES ($1, $2, 'Tontine close', '', 'enrolling', 10000, 'monthly', 5, 'rolling', '2026-03-01', $3)`,
      [CLOSED_ROLLING, A.id, USERS.awa],
    );
    await f.h.superuser(
      `INSERT INTO projects (id, association_id, name, description, status, installment_amount, frequency, due_day,
                             schedule_type, start_date, created_by)
       VALUES ($1, $2, 'Tontine de Man', '', 'active', 5000, 'monthly', 10, 'rolling', '2026-01-01', $3)`,
      [ROLLING_B, B.id, USERS.koffi],
    );
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
    await f.resetMembers();
    await f.h.superuser(`UPDATE projects SET status = 'enrolling' WHERE id = $1`, [CLOSED_ROLLING]);
  });

  it('l’horizon reste à 12 : échéances ajoutées à la suite, au montant du projet ; idempotente', async () => {
    const kofi = await enroll(PROJECTS.rollingA, { phone: NEW.kofi, firstName: 'Kofi', lastName: 'Annan' });
    expect(await lines(kofi)).toHaveLength(12);

    await run('2026-06-10T01:00:00Z');
    const after = await lines(kofi);
    expect(after.map((l) => l.sequence)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(after.slice(12)).toEqual(
      ['2027-03-05', '2027-04-05', '2027-05-05', '2027-06-05'].map((dueDate, i) => ({
        sequence: 13 + i,
        dueDate,
        amountDue: 25_000,
        status: 'upcoming',
      })),
    );
    expect(after.filter((l) => l.dueDate >= '2026-06-10')).toHaveLength(12);

    await run('2026-06-10T01:00:00Z');
    expect(await lines(kofi)).toHaveLength(16);
  });

  it('toutes les associations : chaque ligne reprend l’association, le projet et la personne de son inscription', async () => {
    const kofi = await enroll(PROJECTS.rollingA, { phone: NEW.kofi, firstName: 'Kofi', lastName: 'Annan' });
    const yao = await enroll(
      ROLLING_B,
      { phone: NEW.yao, firstName: 'Yao', lastName: 'Bé' },
      { aid: B.id, token: f.tokens.koffi },
    );
    await run('2026-06-10T01:00:00Z');
    // B : 12 échéances du 10 mars 2026 au 10 février 2027, 9 encore à venir au 10 juin (celle du jour comprise).
    expect((await lines(yao)).map((l) => l.dueDate).slice(12)).toEqual(['2027-03-10', '2027-04-10', '2027-05-10']);
    const owners = await f.h.superuser(
      `SELECT DISTINCT i.enrollment_id, i.association_id, i.project_id, i.user_id = e.user_id AS same_user
         FROM installments i JOIN enrollments e ON e.id = i.enrollment_id ORDER BY i.association_id`,
    );
    expect(owners.rows).toEqual(
      expect.arrayContaining([
        { enrollment_id: kofi, association_id: A.id, project_id: PROJECTS.rollingA, same_user: true },
        { enrollment_id: yao, association_id: B.id, project_id: ROLLING_B, same_user: true },
      ]),
    );
    expect(owners.rows).toHaveLength(2);
  });

  it('tâche restée sans effet : dates manquées créées (dues ou en retard), toujours 12 à venir', async () => {
    const kofi = await enroll(PROJECTS.rollingA, { phone: NEW.kofi, firstName: 'Kofi', lastName: 'Annan' });
    await run('2027-06-10T01:00:00Z');
    const after = await lines(kofi);
    expect(after.map((l) => l.sequence)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    expect(after.filter((l) => l.dueDate >= '2027-06-10')).toHaveLength(12);
    expect(after.find((l) => l.dueDate === '2027-03-05')?.status).toBe('late');
  });

  it('inscription en attente de signature (lot 4.1) : aucune échéance avant la signature (décision 20)', async () => {
    const pending = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO enrollments (id, association_id, project_id, user_id, status, starts_from, joined_at)
       VALUES ($1, $2, $3, $4, 'pending_signature', '2026-03-01', now())`,
      [pending, A.id, PROJECTS.rollingA, USERS.moussa],
    );
    await run('2026-06-10T01:00:00Z');
    expect(await lines(pending)).toEqual([]);
  });

  it('inscription retirée, projet clos, dates fixes : inchangés', async () => {
    const withdrawn = await enroll(PROJECTS.rollingA, { userId: USERS.moussa });
    const res = await f.call(`/associations/${A.id}/enrollments/${withdrawn}/withdraw`, {
      token: f.tokens.awa,
      method: 'POST',
      body: {},
    });
    expect(res.status).toBe(200);
    const closed = await enroll(CLOSED_ROLLING, { phone: NEW.ama, firstName: 'Ama', lastName: 'Kouassi' });
    await f.h.superuser(`UPDATE projects SET status = 'completed' WHERE id = $1`, [CLOSED_ROLLING]);
    const fixed = await enroll(PROJECTS.a, { phone: NEW.kofi, firstName: 'Kofi', lastName: 'Annan' });
    const before = await Promise.all([withdrawn, closed, fixed].map(lines));

    await run('2026-06-10T01:00:00Z');
    expect(await Promise.all([withdrawn, closed, fixed].map(lines))).toEqual(before);
  });
});
