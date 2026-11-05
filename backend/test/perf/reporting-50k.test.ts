import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { A, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from '../integration/ledger.fixture.js';
import { PLANS } from '../integration/platform-associations.fixture.js';

/**
 * Lot 2.6 · étape 4, vérification sur un jeu de charge de 50 000 échéances : 2 000 souscripteurs × 25 mensualités de
 * 25 000 F (janvier 2025 → janvier 2027), échéances passées soldées à 80 % par un paiement validé chacune (≈ 27 000
 * paiements et répartitions). Mesure de durée : lancée seule (vitest.perf.config.ts).
 *
 * Objectif d'architecture/09 (95 % des lectures < 300 ms) : tenu par le tableau de bord en cache (60 s). Calcul complet
 * (rapport, tableau de bord sans cache) : ≈ 1,1 s sur le serveur de développement, dont ≈ 0,1 s de PostgreSQL (index
 * utilisés) — le reste est le décodage et le calcul en mémoire des 50 000 échéances (décision de l'utilisateur, lot 2.6 :
 * alléger le code sans changer la spec ; écart noté dans .claude/notes/a-verifier.md). Garde-fou de régression : 3 s.
 */

const NOW = new Date('2026-06-15T10:00:00Z');
const PROJECT = '00000000-0000-7000-8000-00000000c3f2';
const SUBSCRIBERS = 2_000;
const MONTHS = 25;
/** Lecture servie par le cache (architecture/09). */
const BUDGET_MS = 300;
/** Calcul complet sur 50 000 échéances : garde-fou de régression, pas l'objectif (voir plus haut). */
const FULL_COMPUTE_CEILING_MS = 3_000;
const Report = ENDPOINTS['rp.report'].operations.get.response.body;
const Dashboard = ENDPOINTS['as.dashboard'].operations.get.response.body;

describe('rapport et tableau de bord : 50 000 échéances', () => {
  let f: LedgerFixture;

  /** Meilleure de trois mesures, après un préchauffage (compilation, connexions). */
  const timed = async (path: string, before: () => Promise<unknown> = () => Promise.resolve()) => {
    const once = async () => {
      await before();
      const started = performance.now();
      const res = await f.call(path, { token: f.tokens.awa });
      const elapsed = performance.now() - started;
      expect(res.status).toBe(200);
      return { body: await res.json(), elapsed };
    };
    await once();
    const runs = [await once(), await once(), await once()];
    return { body: runs[0]?.body, elapsed: Math.min(...runs.map((r) => r.elapsed)), all: runs.map((r) => r.elapsed) };
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startLedgerFixture();
    await f.h.superuser('UPDATE plans SET max_subscribers = 10000 WHERE id = $1', [PLANS.essentiel]);
    await f.h.superuser(
      `INSERT INTO projects (id, association_id, name, description, status, installment_amount, frequency, due_day,
                             schedule_type, start_date, end_date, created_by)
       VALUES ($1, $2, 'Charge 2000 × 25', '', 'active', 25000, 'monthly', 5, 'fixed', '2025-01-01', '2027-01-31', $3)`,
      [PROJECT, A.id, USERS.awa],
    );
    // Personnes, appartenances, inscriptions.
    await f.h.superuser(
      `CREATE TABLE load_people AS
         SELECT n, gen_random_uuid() AS user_id, gen_random_uuid() AS enrollment_id
           FROM generate_series(1, $1::int) AS n`,
      [SUBSCRIBERS],
    );
    await f.h.superuser(
      `INSERT INTO users (id, first_name, last_name, phone_e164, status)
       SELECT user_id, 'Charge ' || n, 'Annan', '+2250760' || lpad(n::text, 6, '0'), 'active' FROM load_people`,
    );
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       SELECT gen_random_uuid(), $1, user_id, 'subscriber', 'active', '2025-01-01' FROM load_people`,
      [A.id],
    );
    await f.h.superuser(
      `INSERT INTO enrollments (id, association_id, project_id, user_id, status, starts_from, joined_at)
       SELECT enrollment_id, $1, $2, user_id, 'active', '2025-01-01', '2025-01-01' FROM load_people`,
      [A.id, PROJECT],
    );
    // 25 mensualités par personne ; passées : 4 sur 5 soldées, les autres en retard ; futures : à venir.
    await f.h.superuser(
      `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                 amount_due, amount_paid, status, paid_at)
       SELECT gen_random_uuid(), $1, $2, p.enrollment_id, p.user_id, 'periodic', m,
              d, 25000, CASE WHEN settled THEN 25000 ELSE 0 END,
              (CASE WHEN settled THEN 'paid' WHEN d < $3::date THEN 'late' ELSE 'upcoming' END)::installments_status,
              CASE WHEN settled THEN d + interval '1 day' END
         FROM load_people p
         CROSS JOIN generate_series(1, $4::int) AS m
         CROSS JOIN LATERAL (SELECT (date '2025-01-05' + make_interval(months => m - 1))::date AS d) dd
         CROSS JOIN LATERAL (SELECT d < $3::date AND (p.n + m) % 5 <> 0 AS settled) s`,
      [A.id, PROJECT, '2026-06-05', MONTHS],
    );
    // Un paiement validé par échéance soldée, et sa répartition confirmée.
    await f.h.superuser(
      `CREATE TABLE load_paid AS
         SELECT gen_random_uuid() AS payment_id, id AS installment_id, enrollment_id, user_id, due_date
           FROM installments WHERE project_id = $1 AND status = 'paid'`,
      [PROJECT],
    );
    // Paiements et répartitions dans la même instruction : contrôle différé de la somme au COMMIT.
    await f.h.superuser(
      `WITH p AS (
         INSERT INTO payments (id, association_id, project_id, enrollment_id, user_id, amount_declared, paid_on,
                               transaction_reference, status, declared_at, reviewed_by, reviewed_at, idempotency_key)
         SELECT payment_id, $1, $2, enrollment_id, user_id, 25000, due_date, 'REF-42', 'validated', due_date,
                $3, due_date + interval '1 day', payment_id::text
           FROM load_paid
         RETURNING id)
       INSERT INTO allocations (id, association_id, payment_id, installment_id, enrollment_id, amount, state, created_at)
       SELECT gen_random_uuid(), $1, l.payment_id, l.installment_id, l.enrollment_id, 25000, 'confirmed', l.due_date
         FROM load_paid l JOIN p ON p.id = l.payment_id`,
      [A.id, PROJECT, USERS.awa],
    );
    await f.h.superuser('DROP TABLE load_people, load_paid');
    await f.h.superuser('ANALYZE');
  }, 600_000);

  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });

  it('jeu de charge : 50 000 échéances, ≈ 30 000 paiements validés', async () => {
    const { rows } = await f.h.superuser(
      `SELECT (SELECT count(*)::int FROM installments WHERE project_id = $1) AS installments,
              (SELECT count(*)::int FROM payments WHERE project_id = $1) AS payments`,
      [PROJECT],
    );
    expect(rows[0]).toMatchObject({ installments: SUBSCRIBERS * MONTHS });
    expect((rows[0] as { payments: number }).payments).toBeGreaterThan(25_000);
  });

  it(`rp.report (calcul complet) en moins de ${String(FULL_COMPUTE_CEILING_MS)} ms`, async () => {
    const r = await timed(`/associations/${A.id}/projects/${PROJECT}/report`);
    expect(Report.parse(r.body)).toBeDefined();
    console.info(`rp.report : ${r.all.map((ms) => ms.toFixed(0)).join(' / ')} ms`);
    expect(r.elapsed).toBeLessThan(FULL_COMPUTE_CEILING_MS);
  });

  it(`as.dashboard sans cache (calcul complet) en moins de ${String(FULL_COMPUTE_CEILING_MS)} ms`, async () => {
    const r = await timed(`/associations/${A.id}/dashboard`, () => f.redis.exec(['redis-cli', 'FLUSHDB']));
    const dashboard = Dashboard.parse(r.body);
    expect(dashboard.subscribersCount).toBeGreaterThanOrEqual(SUBSCRIBERS);
    console.info(`as.dashboard : ${r.all.map((ms) => ms.toFixed(0)).join(' / ')} ms`);
    expect(r.elapsed).toBeLessThan(FULL_COMPUTE_CEILING_MS);
  });

  it(`as.dashboard en cache en moins de ${String(BUDGET_MS)} ms`, async () => {
    const r = await timed(`/associations/${A.id}/dashboard`);
    console.info(`as.dashboard (cache) : ${r.all.map((ms) => ms.toFixed(0)).join(' / ')} ms`);
    expect(r.elapsed).toBeLessThan(BUDGET_MS);
  });
});
