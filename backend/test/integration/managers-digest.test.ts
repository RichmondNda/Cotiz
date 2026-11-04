import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { SendManagersDigestUseCase } from '../../src/modules/notifications/application/send-managers-digest.use-case.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';

/**
 * Lot 2.6 · étape 3 : tâche managers.digest (jobs.yaml : quotidienne 07:30 locale) — notification in-app « Récapitulatif
 * du jour » aux owner/manager actifs : paiements à valider, souscripteurs passés en retard ce jour, codes non remis.
 *
 * Horloge simulée : inscriptions le 2026-03-01 ; PROJECTS.a : 25 000 F le 5 de chaque mois depuis le 2026-03-05.
 * Abidjan = UTC : 07:30Z est 07:30 locale. Fixture : A gérée par Awa et Aminata (manager), Koffi y est lecteur (viewer) ;
 * B gérée par Koffi, Awa y est souscriptrice.
 */

const ENROLLED_ON = new Date('2026-03-01T10:00:00Z');

interface Bell {
  user_id: string;
  association_id: string;
  type: string;
  title: string;
  body: string;
  action_url: string;
  data: Record<string, unknown>;
  dedupe_key: string;
}

/** Destinataires dans A : owner et manager actifs, dans l'ordre des identifiants. */
const MANAGERS_A = [USERS.awa, USERS.aminata];

const shiftDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};

describe('managers.digest', () => {
  let f: LedgerFixture;
  let worker: INestApplicationContext;

  const run = (at: string) => worker.get(SendManagersDigestUseCase).execute(new Date(at));
  const bells = async () =>
    (
      await f.h.superuser(
        `SELECT user_id, association_id, type, title, body, action_url, data, dedupe_key
           FROM notifications WHERE type = 'digest.daily' ORDER BY created_at, user_id`,
      )
    ).rows as Bell[];
  const enrollNew = async (phone: string) => {
    const res = await f.call(`/associations/${A.id}/projects/${PROJECTS.a}/enrollments`, {
      token: f.tokens.awa,
      method: 'POST',
      body: { phone, firstName: 'Kofi', lastName: 'Annan' },
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(res.status).toBe(201);
  };
  /** Moussa inscrit à PROJECTS.a ; s'il le faut, sa première échéance (5 mars) déclarée en attente. */
  const moussa = async (options: { pending?: boolean } = {}) => {
    const m = await f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-03-01' });
    const march = await f.installmentOf(m.id, '2026-03-05');
    if (options.pending) {
      await f.record({
        enrollmentId: m.id,
        userId: USERS.moussa,
        amount: 25_000,
        status: 'pending',
        declaredAt: '2026-03-01T12:00:00Z',
        lines: [{ installmentId: march, amount: 25_000, state: 'proposed' }],
      });
    }
    return m;
  };
  /** 07:30 (UTC = Abidjan) du jour où l'échéance du 5 mars passe en retard : 5 mars + délai de grâce + 1. */
  const lateMorningOfMarch = async () => {
    const rows = (await f.h.superuser(`SELECT grace_days FROM projects WHERE id = $1`, [PROJECTS.a])).rows as {
      grace_days: number;
    }[];
    return shiftDays('2026-03-05T07:30:00Z', (rows[0]?.grace_days ?? 0) + 1);
  };

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
    await f.h.superuser('DELETE FROM notifications');
    await f.resetLedger();
    // Marques « journée faite » de la tâche (Redis).
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
    await f.h.superuser(`UPDATE associations SET timezone = 'Africa/Abidjan' WHERE id = ANY($1::uuid[])`, [
      [A.id, B.id],
    ]);
  });

  it('rien à signaler (aucun paiement en attente, aucun retard, aucun code) : aucune notification', async () => {
    await moussa();
    await run('2026-03-02T07:30:00Z');
    expect(await bells()).toEqual([]);
  });

  it('à 07:30 locale : une cloche au gestionnaire (pas avant), texte, lien et clé du jour', async () => {
    await moussa({ pending: true });

    await run('2026-03-02T07:29:00Z');
    expect(await bells()).toEqual([]);

    await run('2026-03-02T07:30:00Z');
    expect(await bells()).toEqual(
      MANAGERS_A.map((userId) => ({
        user_id: userId,
        association_id: A.id,
        type: 'digest.daily',
        title: 'Récapitulatif du jour',
        body: '1 paiement à valider.',
        action_url: '/asso',
        data: { actionLabel: 'Ouvrir le tableau de bord', digest: true, audience: 'manager' },
        dedupe_key: `digest.daily:${A.id}:2026-03-02:${userId}`,
      })),
    );
  });

  it('relancée le même jour : rien de plus ; marque perdue (Redis vidé) : une seule cloche ; le lendemain : une nouvelle', async () => {
    await moussa({ pending: true });
    await run('2026-03-02T07:30:00Z');
    await run('2026-03-02T08:30:00Z');
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
    await run('2026-03-02T09:30:00Z');
    expect(await bells()).toHaveLength(MANAGERS_A.length);

    // Worker arrêté à 07:30 le lendemain : rattrapé au passage suivant.
    await run('2026-03-03T10:30:00Z');
    expect((await bells()).map((b) => b.dedupe_key)).toEqual(
      ['2026-03-02', '2026-03-03'].flatMap((day) => MANAGERS_A.map((u) => `digest.daily:${A.id}:${day}:${u}`)),
    );
  });

  it('nouveau retard : signalé le jour où l’échéance passe en retard, ni la veille ni le lendemain', async () => {
    await moussa();
    const lateMorning = await lateMorningOfMarch();

    await run(shiftDays(lateMorning, -1));
    expect(await bells()).toEqual([]);

    await run(lateMorning);
    expect((await bells()).map((b) => [b.user_id, b.body])).toEqual(
      MANAGERS_A.map((u) => [u, '1 souscripteur passé en retard.']),
    );

    await run(shiftDays(lateMorning, 1));
    expect(await bells()).toHaveLength(MANAGERS_A.length);
  });

  it('nouveau retard : partiellement payée → comptée ; déclarée (en attente) → pas un retard, un paiement à valider', async () => {
    const m = await moussa();
    const march = await f.installmentOf(m.id, '2026-03-05');
    await f.record({
      enrollmentId: m.id,
      userId: USERS.moussa,
      amount: 10_000,
      status: 'validated',
      declaredAt: '2026-03-03T09:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-03-03T10:00:00Z',
      lines: [{ installmentId: march, amount: 10_000, state: 'confirmed' }],
    });
    const lateMorning = await lateMorningOfMarch();
    await run(lateMorning);
    expect((await bells()).map((b) => b.body)).toEqual(MANAGERS_A.map(() => '1 souscripteur passé en retard.'));

    // Le reste déclaré avant le jour suivant de passage en retard (avril) : en attente, donc pas en retard.
    const april = await f.installmentOf(m.id, '2026-04-05');
    await f.record({
      enrollmentId: m.id,
      userId: USERS.moussa,
      amount: 25_000,
      status: 'pending',
      declaredAt: '2026-04-04T09:00:00Z',
      lines: [{ installmentId: april, amount: 25_000, state: 'proposed' }],
    });
    const aprilMorning = shiftDays(lateMorning, 31);
    expect(aprilMorning.slice(5, 7)).toBe('04');
    await run(aprilMorning);
    expect((await bells()).slice(MANAGERS_A.length).map((b) => b.body)).toEqual(
      MANAGERS_A.map(() => '1 paiement à valider.'),
    );
  });

  it('codes d’activation non remis comptés, avec les paiements à valider', async () => {
    await moussa({ pending: true });
    await enrollNew('+2250711223344');
    await enrollNew('+2250722334455');
    await run('2026-03-02T07:30:00Z');
    expect((await bells()).map((b) => b.body)).toEqual(
      MANAGERS_A.map(() => '1 paiement à valider · 2 codes d’activation à remettre.'),
    );
  });

  it('lecteur (viewer) et souscripteur jamais destinataires ; compte désactivé : rien pour lui seul', async () => {
    await moussa({ pending: true });
    const status = async () =>
      ((await f.h.superuser(`SELECT status FROM users WHERE id = $1`, [USERS.aminata])).rows as { status: string }[])[0]
        ?.status ?? 'active';
    const before = await status();
    try {
      await f.h.superuser(`UPDATE users SET status = 'disabled' WHERE id = $1`, [USERS.aminata]);
      await run('2026-03-02T07:30:00Z');
      // Koffi (lecteur de A) et Moussa (souscripteur) : jamais ; Aminata désactivée : rien ; Awa : sa cloche.
      expect((await bells()).map((b) => b.user_id)).toEqual([USERS.awa]);
    } finally {
      await f.h.superuser(`UPDATE users SET status = $2 WHERE id = $1`, [USERS.aminata, before]);
    }
  });

  it('fuseau de chaque association : 07:30 locale, pas 07:30 UTC', async () => {
    await moussa({ pending: true });
    // Lagos = UTC+1 : 06:30Z est 07:30 locale.
    await f.h.superuser(`UPDATE associations SET timezone = 'Africa/Lagos' WHERE id = $1`, [A.id]);
    await run('2026-03-02T06:29:00Z');
    expect(await bells()).toEqual([]);
    await run('2026-03-02T06:30:00Z');
    expect((await bells()).map((b) => b.dedupe_key)).toEqual(
      MANAGERS_A.map((u) => `digest.daily:${A.id}:2026-03-02:${u}`),
    );
  });

  it('isolation et statut : chaque association compte les siens ; suspendue ou fermée : rien, l’autre reçoit le sien', async () => {
    await moussa({ pending: true });
    const fatou = await f.enrollByApi(
      { userId: USERS.fatou, startsFrom: '2026-03-01' },
      { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
    );
    const first = (
      await f.h.superuser(`SELECT id::text FROM installments WHERE enrollment_id = $1 ORDER BY due_date LIMIT 1`, [
        fatou.id,
      ])
    ).rows as { id: string }[];
    for (const declaredAt of ['2026-03-01T12:00:00Z', '2026-03-01T13:00:00Z']) {
      await f.record({
        enrollmentId: fatou.id,
        userId: USERS.fatou,
        associationId: B.id,
        projectId: PROJECTS.b,
        amount: 1_000,
        status: 'pending',
        declaredAt,
        lines: [{ installmentId: first[0]?.id ?? '', amount: 1_000, state: 'proposed' }],
      });
    }
    const rows = (await f.h.superuser(`SELECT status FROM associations WHERE id = $1`, [A.id])).rows as {
      status: string;
    }[];
    const before = rows[0]?.status ?? 'active';
    const seen = async () => (await bells()).map((b) => [b.user_id, b.association_id, b.body]);
    try {
      for (const status of ['suspended', 'closed']) {
        await f.h.superuser(`UPDATE associations SET status = $2 WHERE id = $1`, [A.id, status]);
        await run('2026-03-02T07:30:00Z');
      }
      // Koffi (B) : les 2 paiements de B, jamais celui de A ; Awa n'est que souscriptrice de B.
      expect(await seen()).toEqual([[USERS.koffi, B.id, '2 paiements à valider.']]);
      await f.h.superuser(`UPDATE associations SET status = 'active' WHERE id = $1`, [A.id]);
      await run('2026-03-02T08:30:00Z');
      expect(await seen()).toEqual([
        [USERS.koffi, B.id, '2 paiements à valider.'],
        ...MANAGERS_A.map((u) => [u, A.id, '1 paiement à valider.']),
      ]);
    } finally {
      await f.h.superuser(`UPDATE associations SET status = $2 WHERE id = $1`, [A.id, before]);
    }
  });
});
