import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { ComputeUsageUseCase } from '../../src/modules/reporting/application/compute-usage.use-case.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { STAFF } from './platform-associations.fixture.js';

/**
 * Lot 4.6 · étape 4 : statistiques d'usage. Tâche `usage.daily` (jours locaux finis, la veille dès 02:00, rattrapage
 * de 7 jours, écrite une fois) et pf.asso.usage (plateforme, 30 derniers jours par défaut).
 *
 * Horloge : Date au 2026-11-15 10:00 UTC (Abidjan, UTC+0). Membres de A : Awa (owner), Aminata (manager), Koffi
 * (viewer), Moussa (souscripteur) ; Awa est souscriptrice de B, Koffi le gère.
 */

const NOW = new Date('2026-11-15T10:00:00Z');
const Usage = ENDPOINTS['pf.asso.usage'].operations.get.response.body;

describe('statistiques d’usage (usage.daily, pf.asso.usage)', () => {
  let f: LedgerFixture;
  let worker: INestApplicationContext;
  let support: string;

  const compute = (now: Date) => worker.get(ComputeUsageUseCase).execute(now);
  /** Une ligne de session : `family` commune = renouvellement de la même connexion. */
  const session = (userId: string, space: 'association' | 'subscriber' | 'platform', at: string, family: string) =>
    f.h.superuser(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, family_id, space, created_at, expires_at)
       VALUES (gen_random_uuid(), $1, md5(random()::text), $2, $3, $4, $4::timestamptz + interval '30 days')`,
      [userId, family, space, at],
    );
  const rows = async (aid: string) =>
    (
      await f.h.superuser(
        `SELECT day::text, logins, active_users, payments_declared, payments_validated,
                avg_validation_hours::float AS hours
           FROM usage_daily WHERE association_id = $1 ORDER BY day`,
        [aid],
      )
    ).rows as {
      day: string;
      logins: number;
      active_users: number;
      payments_declared: number;
      payments_validated: number;
      hours: number;
    }[];
  const read = (aid: string, query = '', token = support) =>
    f.call(`/platform/associations/${aid}/usage${query}`, { token });

  /**
   * Le 14 à A : Awa se connecte deux fois (la première renouvelée), Moussa une fois dans l'espace souscripteur, Koffi
   * renouvelle une connexion de la veille ; Awa se connecte aussi comme souscriptrice (de B seulement). Le 13 : Koffi.
   * Paiements de A : déclaré le 14 et validé 6 h après ; déclaré le 13, validé le 14 14 h après ; déclaré le 14 en
   * attente. Chez B : un paiement validé le 14.
   */
  const scenario = async () => {
    const [f1, f2, f3, f4, f5] = Array.from({ length: 5 }, () => crypto.randomUUID());
    await session(USERS.awa, 'association', '2026-11-14T08:00:00Z', f1 ?? '');
    await session(USERS.awa, 'association', '2026-11-14T08:20:00Z', f1 ?? '');
    await session(USERS.awa, 'association', '2026-11-14T14:00:00Z', f2 ?? '');
    await session(USERS.moussa, 'subscriber', '2026-11-14T23:30:00Z', f3 ?? '');
    await session(USERS.koffi, 'association', '2026-11-13T23:59:00Z', f4 ?? '');
    await session(USERS.koffi, 'association', '2026-11-14T00:10:00Z', f4 ?? '');
    await session(USERS.awa, 'subscriber', '2026-11-14T09:00:00Z', f5 ?? '');
    // Hors journée et hors périmètre : le 15 (pas fini), et l'espace plateforme.
    await session(USERS.awa, 'association', '2026-11-15T00:30:00Z', crypto.randomUUID());
    await session(USERS.aminata, 'platform', '2026-11-14T10:00:00Z', crypto.randomUUID());

    const kofi = await f.enrollByApi({
      phone: '+2250711223344',
      firstName: 'Kofi',
      lastName: 'Annan',
      startsFrom: '2026-03-01',
    });
    const userId = await f.userOf(kofi.id);
    const line = async (due: string) => ({
      installmentId: await f.installmentOf(kofi.id, due),
      amount: 25000,
    });
    await f.record({
      enrollmentId: kofi.id,
      userId,
      amount: 25000,
      status: 'validated',
      declaredAt: '2026-11-14T09:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-11-14T15:00:00Z',
      lines: [{ ...(await line('2026-03-05')), state: 'confirmed' }],
    });
    await f.record({
      enrollmentId: kofi.id,
      userId,
      amount: 25000,
      status: 'validated',
      declaredAt: '2026-11-13T20:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-11-14T10:00:00Z',
      lines: [{ ...(await line('2026-04-05')), state: 'confirmed' }],
    });
    await f.record({
      enrollmentId: kofi.id,
      userId,
      amount: 25000,
      status: 'pending',
      declaredAt: '2026-11-14T18:00:00Z',
      lines: [{ ...(await line('2026-05-05')), state: 'proposed' }],
    });
    const yao = await f.enrollByApi(
      { phone: '+2250733445566', firstName: 'Yao', lastName: 'Bé', startsFrom: '2026-11-01' },
      { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
    );
    await f.record({
      enrollmentId: yao.id,
      userId: await f.userOf(yao.id),
      associationId: B.id,
      projectId: PROJECTS.b,
      amount: 25000,
      status: 'validated',
      declaredAt: '2026-11-14T08:00:00Z',
      reviewedBy: USERS.koffi,
      reviewedAt: '2026-11-14T09:00:00Z',
      lines: [{ installmentId: await f.installmentOf(yao.id, '2026-11-05'), amount: 25000, state: 'confirmed' }],
    });
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startLedgerFixture();
    worker = await NestFactory.createApplicationContext(
      WorkerModule.register(
        loadConfig({
          NODE_ENV: 'test',
          DATABASE_URL: f.h.db.urlFor('cotiz_app'),
          REDIS_URL: f.redis.getConnectionUrl(),
          OUTBOX_RELAY_INTERVAL_MS: '0',
          S3_ENDPOINT: 'http://127.0.0.1:1',
        }),
      ),
      { logger: false },
    );
    support = await f.login('platform', STAFF.support.email);
  });

  afterAll(async () => {
    await worker.close();
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await f.h.superuser(
      `DELETE FROM usage_daily; DELETE FROM sessions WHERE created_at < '2026-11-15T10:00:00Z' OR space = 'platform'
         AND user_id = '${USERS.aminata}'`,
    );
    await f.resetLedger();
    await scenario();
  });

  describe('usage.daily', () => {
    it('avant 02:00 locale : les 6 jours finis avant la veille ; la veille attend', async () => {
      await compute(new Date('2026-11-15T01:59:00Z'));
      const days = (await rows(A.id)).map((r) => r.day);
      expect(days).toEqual(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    });

    it('connexions, personnes actives, paiements déclarés et validés, délai moyen du jour local', async () => {
      await compute(NOW);
      const ofA = await rows(A.id);
      expect(ofA.find((r) => r.day === '2026-11-14')).toEqual({
        day: '2026-11-14',
        logins: 3,
        active_users: 3,
        payments_declared: 2,
        payments_validated: 2,
        hours: 10,
      });
      expect(ofA.find((r) => r.day === '2026-11-13')).toEqual({
        day: '2026-11-13',
        logins: 1,
        active_users: 1,
        payments_declared: 1,
        payments_validated: 0,
        hours: 0,
      });
      expect(ofA.find((r) => r.day === '2026-11-12')).toMatchObject({
        logins: 0,
        active_users: 0,
        payments_declared: 0,
      });
      expect(ofA).toHaveLength(7);
    });

    it('chaque association avec ses seuls membres et paiements (B : Awa souscriptrice et Koffi actifs, une connexion)', async () => {
      await compute(NOW);
      expect((await rows(B.id)).find((r) => r.day === '2026-11-14')).toEqual({
        day: '2026-11-14',
        logins: 1,
        active_users: 2,
        payments_declared: 1,
        payments_validated: 1,
        hours: 1,
      });
    });

    it('rejeu : rien de réécrit, même si l’activité de la journée a changé depuis', async () => {
      expect(await compute(NOW)).toBeGreaterThan(0);
      const before = await rows(A.id);
      await session(USERS.aminata, 'association', '2026-11-14T12:00:00Z', crypto.randomUUID());
      expect(await compute(new Date('2026-11-15T11:40:00Z'))).toBe(0);
      expect(await rows(A.id)).toEqual(before);
    });

    it('passages simultanés : chaque jour écrit une fois', async () => {
      const written = await Promise.all([compute(NOW), compute(NOW), compute(NOW)]);
      const total = written.reduce((a, b) => a + b, 0);
      const stored = (await f.h.superuser('SELECT 1 FROM usage_daily')).rowCount;
      expect(total).toBe(stored);
      expect((await rows(A.id)).filter((r) => r.day === '2026-11-14')).toHaveLength(1);
    });

    it('association suspendue : ignorée', async () => {
      await f.h.superuser(`UPDATE associations SET status = 'suspended' WHERE id = $1`, [B.id]);
      try {
        await compute(NOW);
        expect(await rows(B.id)).toEqual([]);
        expect(await rows(A.id)).toHaveLength(7);
      } finally {
        await f.h.superuser(`UPDATE associations SET status = 'active' WHERE id = $1`, [B.id]);
      }
    });
  });

  describe('pf.asso.usage', () => {
    beforeEach(async () => {
      await compute(NOW);
    });

    it('par défaut les 30 derniers jours finis, du plus ancien au plus récent', async () => {
      const res = await read(A.id);
      expect(res.status).toBe(200);
      const { days } = Usage.parse(await res.json());
      expect(days.map((d) => d.day)).toEqual([
        '2026-11-08',
        '2026-11-09',
        '2026-11-10',
        '2026-11-11',
        '2026-11-12',
        '2026-11-13',
        '2026-11-14',
      ]);
      expect(days.at(-1)).toEqual({
        day: '2026-11-14',
        logins: 3,
        activeUsers: 3,
        paymentsDeclared: 2,
        paymentsValidated: 2,
        avgValidationHours: 10,
      });
    });

    it('période donnée ; inversée ou de plus de 366 jours : 422', async () => {
      const { days } = Usage.parse(await (await read(A.id, '?from=2026-11-13&to=2026-11-13')).json());
      expect(days.map((d) => d.day)).toEqual(['2026-11-13']);
      expect((await read(A.id, '?from=2026-11-14&to=2026-11-13')).status).toBe(422);
      expect((await read(A.id, '?from=2025-01-01&to=2026-01-02')).status).toBe(422);
      expect((await read(A.id, '?from=2026-13-01')).status).toBe(422);
    });

    it('association inconnue : 404 ; jeton d’association : refusé', async () => {
      expect((await read(crypto.randomUUID())).status).toBe(404);
      expect([401, 403, 404]).toContain((await read(A.id, '', f.tokens.awa)).status);
      expect((await f.call(`/platform/associations/${A.id}/usage`)).status).toBe(401);
    });

    it('chaque association lue séparément', async () => {
      const { days } = Usage.parse(await (await read(B.id, '?from=2026-11-14&to=2026-11-14')).json());
      expect(days).toEqual([
        {
          day: '2026-11-14',
          logins: 1,
          activeUsers: 2,
          paymentsDeclared: 1,
          paymentsValidated: 1,
          avgValidationHours: 1,
        },
      ]);
    });
  });
});
