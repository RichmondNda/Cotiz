import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PlatformDashboard } from '@cotiz/contracts';
import { todayIn } from '@cotiz/domain';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { RefreshPlatformStatsUseCase } from '../../src/modules/reporting/reporting.public.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, asManagerOf, B, errorOf, pgCode, USERS } from '../isolation/harness.js';
import {
  C,
  D,
  type PlatformFixture,
  PLANS,
  STAFF,
  startPlatformFixture,
  SUBS,
} from './platform-associations.fixture.js';

/**
 * Lot 1.4 · étape 6 : tableau de bord plateforme (pf.dashboard). Vérification de l'étape : temps de réponse < 300 ms.
 * Compteurs, courbe, répartition par plan et revenu mensuel : vues matérialisées rafraîchies par stats.refresh (worker,
 * espace system) ; demandes à traiter, souscripteurs, associations à surveiller et activité : en direct.
 */

const TZ = 'Africa/Abidjan';
/** Association suspendue ajoutée : active pendant deux mois de la courbe (activation et suspension relatives). */
const E = '00000000-0000-7000-8000-0000000016e1';
const DAY = 86_400_000;
const VIEWS = [
  'stats_platform_kpi',
  'stats_active_associations_by_month',
  'stats_associations_by_plan',
  'stats_recurring_revenue',
];

/** Premier jour du mois, `offset` mois après celui de `now` (fuseau de la plateforme = UTC). */
function monthStart(now: Date, offset: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

describe('tableau de bord plateforme (pf.dashboard)', () => {
  let f: PlatformFixture;
  let worker: INestApplicationContext;
  let support: string;
  const now = new Date();

  const refresh = () => worker.get(RefreshPlatformStatsUseCase).execute();
  const dashboard = async (token = support) => {
    const res = await f.call('/platform/dashboard', { token });
    expect(res.status).toBe(200);
    return PlatformDashboard.parse(await res.json());
  };
  const request = (id: number, createdAt: Date, status = 'pending') =>
    f.h.superuser(
      `INSERT INTO association_requests (id, reference, association_name, association_type, city, country,
         activity_description, contact_first_name, contact_last_name, contact_title, contact_email, contact_phone,
         estimated_subscribers, desired_plan_id, terms_accepted_at, status, created_at)
       VALUES ($1, $2, $3, 'tontine', 'Abidjan', 'CI', 'Entraide', 'Awa', 'Koné', 'Présidente', $4, '+2250700000099',
         '1_20', $5, $6, $7, $6)`,
      [
        `00000000-0000-7000-8000-0000000016f${String(id)}`,
        `DEM-2026-0010${String(id)}`,
        `Demande ${String(id)}`,
        `demande${String(id)}@asso.ci`,
        PLANS.pro,
        createdAt,
        status,
      ],
    );

  beforeAll(async () => {
    f = await startPlatformFixture();
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

    // Demandes : 4 à traiter (la plus ancienne en premier), une approuvée.
    await request(1, new Date(now.getTime() - 3 * DAY));
    await request(2, new Date(now.getTime() - 9 * DAY));
    await request(3, new Date(now.getTime() - 1 * DAY));
    await request(4, new Date(now.getTime() - 5 * DAY));
    await request(5, new Date(now.getTime() - 20 * DAY), 'approved');

    // E : activée il y a 4 mois, suspendue il y a 2 mois (courbe : comptée à la fin des mois -4 et -3 seulement).
    await f.h.superuser(
      `INSERT INTO associations (id, slug, name, type, city, country, contact_email, contact_phone, status,
         onboarding_completed_at, suspended_at, suspension_reason, created_at)
       VALUES ($1, 'cercle-korhogo', 'Cercle de Korhogo', 'tontine', 'Korhogo', 'CI', 'contact@korhogo.ci',
         '+2250700000005', 'suspended', $2, $3, 'Impayé', $2)`,
      [E, new Date(monthStart(now, -4).getTime() + DAY), new Date(monthStart(now, -2).getTime() + DAY)],
    );
    await f.h.superuser(
      `INSERT INTO subscriptions (id, association_id, plan_id, billing_period, status, current_period_start)
       VALUES (gen_random_uuid(), $1, $2, 'monthly', 'suspended', '2026-01-01')`,
      [E, PLANS.pro],
    );
    // B impayée (abonnement annuel Pro passé en retard) ; D créée il y a 5 jours, deux gestionnaires sur deux.
    await f.h.superuser(`UPDATE subscriptions SET status = 'past_due' WHERE id = $1`, [SUBS.b]);
    // Prix annuel non multiple de 12 : l'arrondi inférieur du revenu mensuel est exercé de bout en bout.
    await f.h.superuser(`UPDATE plans SET price_yearly = 250000 WHERE id = $1`, [PLANS.pro]);
    await f.h.superuser(`UPDATE associations SET created_at = $2 WHERE id = $1`, [
      D,
      new Date(now.getTime() - 5 * DAY),
    ]);
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at) VALUES
         (gen_random_uuid(), $1, $2, 'manager', 'invited', NULL),
         (gen_random_uuid(), $3, $4, 'subscriber', 'active', now())`,
      [D, USERS.moussa, B.id, USERS.moussa],
    );
    // A : son owner s'est connecté (espace association) il y a 2 jours.
    await f.h.superuser(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, family_id, space, created_at, last_used_at, expires_at)
       VALUES (gen_random_uuid(), $1, 'a', gen_random_uuid(), 'association', $2, $2, now() + interval '1 day')`,
      [USERS.awa, new Date(now.getTime() - 2 * DAY)],
    );
    // Journal : actions reprises ou non dans l'activité.
    const ago = (days: number) => new Date(now.getTime() - days * DAY);
    await f.h.superuser(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_role, association_id, action, entity_type, entity_id)
       VALUES ($2, $1, 'platform:owner', $5, 'association_request.approve', 'association_request', NULL),
              ($3, $1, 'platform:owner', $6, 'association.suspend', 'association', $6),
              ($4, $1, 'platform:owner', $7, 'subscription.change_plan', 'subscription', $8),
              ($9, $1, 'platform:owner', $7, 'association.update', 'association', $7),
              ($10, $1, 'platform:owner', NULL, 'association.suspend', 'association', NULL)`,
      [STAFF.owner.id, ago(1), ago(2), ago(3), D, C, A.id, SUBS.a, ago(0.5), ago(0.1)],
    );
    support = await f.login('platform', STAFF.support.email);
  });

  afterAll(async () => {
    await worker.close();
    await f.stop();
  });

  it('sans jeton : 401 ; jeton gestionnaire ou souscripteur : 404 (espace plateforme)', async () => {
    expect((await f.call('/platform/dashboard')).status).toBe(401);
    for (const token of [
      await f.login('association', 'awa@test.cotiz.app'),
      await f.login('subscriber', 'moussa@test.cotiz.app'),
    ]) {
      expect((await f.call('/platform/dashboard', { token })).status).toBe(404);
    }
  });

  it('demandes à traiter lues en direct : nombre et les 3 plus anciennes, sans attendre stats.refresh', async () => {
    const before = await dashboard();
    expect(before.pendingRequests).toBe(4);
    expect(before.oldestPendingRequests.map((r) => r.associationName)).toEqual(['Demande 2', 'Demande 4', 'Demande 1']);
    expect(before.oldestPendingRequests[0]?.desiredPlan).toEqual({ id: PLANS.pro, code: 'pro', name: 'Pro' });

    await f.h.superuser(`UPDATE association_requests SET status = 'rejected' WHERE reference = 'DEM-2026-00102'`);
    const after = await dashboard();
    expect(after.pendingRequests).toBe(3);
    expect(after.oldestPendingRequests.map((r) => r.associationName)).toEqual(['Demande 4', 'Demande 1', 'Demande 3']);
  });

  it('compteurs, courbe, plans et revenu : vues matérialisées, à jour après stats.refresh seulement', async () => {
    // Avant tout rafraîchissement : vues remplies à la migration, base vide.
    const stale = await dashboard();
    expect(stale.kpi.totalAssociations).toBe(0);
    expect(stale.associationsByPlan).toEqual([]);

    await refresh();
    const { kpi, activeAssociationsByMonth, associationsByPlan } = await dashboard();
    const thisMonth = monthStart(now, 0);
    const created = await f.h.superuser(`SELECT id, created_at FROM associations`);
    expect(kpi).toEqual({
      // A et B actives ; C et E suspendues ; D en onboarding.
      activeAssociations: 2,
      newAssociationsThisMonth: (created.rows as { created_at: Date }[]).filter((r) => r.created_at >= thisMonth)
        .length,
      totalAssociations: 5,
      // Personnes distinctes : Moussa (A et B), Aminata, Fatou (retirée de A, active dans B), Awa.
      subscribers: 4,
      // Abonnements en cours de A et C (mensuels, Essentiel 10 000 F) + B impayé (annuel Pro : ⌊250 000 / 12⌋ = 20 833 F).
      monthlyRecurringRevenue: { amount: 40833, currency: 'XOF' },
      subscriptionsUpToDate: 2,
      subscriptionsUnpaid: 1,
    });

    expect(activeAssociationsByMonth.map((m) => m.month)).toEqual(
      Array.from({ length: 12 }, (_, i) => todayIn(TZ, monthStart(now, i - 11))),
    );
    // A (1er sept. 2026) et B (15 sept. 2026) actives depuis leur création ; E de -4 à -3 ; C et D jamais.
    const expected = Array.from({ length: 12 }, (_, i) => {
      const end = i === 11 ? now : monthStart(now, i - 10);
      const ab = [new Date('2026-09-01T08:00:00Z'), new Date('2026-09-15T08:00:00Z')].filter((d) => d < end).length;
      return ab + (i === 7 || i === 8 ? 1 : 0);
    });
    expect(activeAssociationsByMonth.map((m) => m.count)).toEqual(expected);
    expect(activeAssociationsByMonth.at(-1)?.count).toBe(kpi.activeAssociations);

    // Plan affiché des associations non fermées : Essentiel pour A, C, D ; Pro pour B et E (abonnement suspendu).
    expect(associationsByPlan).toEqual([
      { plan: { id: PLANS.essentiel, code: 'essentiel', name: 'Essentiel' }, count: 3 },
      { plan: { id: PLANS.pro, code: 'pro', name: 'Pro' }, count: 2 },
    ]);
  });

  it('associations à surveiller : impayée, puis proche du quota ; actives et suspendues absentes', async () => {
    const { watchlist } = await dashboard();
    expect(watchlist).toEqual([
      { associationId: B.id, name: 'Ressortissants de Man', signal: 'unpaid', since: '2026-10-14' },
      { associationId: D, name: 'Jeunesse solidaire 100% Bouaké', signal: 'quota', since: null },
    ]);
  });

  it('activité : 10 dernières actions reprises, la plus récente en premier, avec le nom de l’association', async () => {
    const { activity } = await dashboard();
    expect(
      activity.map(({ type, associationId, associationName }) => ({ type, associationId, associationName })),
    ).toEqual([
      { type: 'request.approved', associationId: D, associationName: 'Jeunesse solidaire 100% Bouaké' },
      { type: 'association.suspended', associationId: C, associationName: 'Mutuelle de Dakar' },
      { type: 'plan.changed', associationId: A.id, associationName: 'Entraide Yopougon' },
      { type: 'association.created', associationId: B.id, associationName: 'Ressortissants de Man' },
      { type: 'association.created', associationId: A.id, associationName: 'Entraide Yopougon' },
    ]);

    await f.h.superuser(
      `INSERT INTO audit_logs (occurred_at, actor_role, association_id, action, entity_type, entity_id)
       SELECT now() - make_interval(hours => n), 'platform:owner', $1, 'association.reactivate', 'association', $1
         FROM generate_series(1, 8) AS n`,
      [C],
    );
    const { activity: latest } = await dashboard();
    expect(latest).toHaveLength(10);
    expect(latest.slice(0, 8).every((e) => e.type === 'association.reactivated')).toBe(true);
    expect(latest.map((e) => e.at)).toEqual([...latest.map((e) => e.at)].sort().reverse());
  });

  it('vérification de l’étape : réponse en moins de 300 ms', async () => {
    await dashboard();
    const durations: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const started = performance.now();
      await dashboard();
      durations.push(performance.now() - started);
    }
    durations.sort((a, b) => a - b);
    expect(durations[2]).toBeLessThan(300);
  });

  it('vues réservées à la plateforme : cotiz_app et cotiz_readonly ne les lisent pas ; cotiz_app ne rafraîchit que depuis l’espace system', async () => {
    for (const view of VIEWS) {
      expect(
        pgCode(await errorOf(f.h.as(asManagerOf(A), (tx) => tx.execute(sql`SELECT * FROM ${sql.identifier(view)}`)))),
      ).toBe('42501');
    }
    expect(
      pgCode(await errorOf(f.h.as(asManagerOf(A), (tx) => tx.execute(sql`SELECT refresh_platform_stats()`)))),
    ).toBe('42501');
    expect(pgCode(await errorOf(f.h.withoutContext((tx) => tx.execute(sql`SELECT refresh_platform_stats()`))))).toBe(
      '42501',
    );
    // cotiz_readonly (rapports) non plus : aucune politique RLS ne protège une vue matérialisée.
    const readonly = new pg.Client({ connectionString: f.h.db.urlFor('cotiz_readonly') });
    await readonly.connect();
    try {
      for (const view of VIEWS) {
        expect(pgCode(await errorOf(readonly.query(`SELECT * FROM ${view}`)))).toBe('42501');
      }
    } finally {
      await readonly.end();
    }
    // Lancée deux fois de suite : idempotente.
    await refresh();
    await refresh();
    expect((await dashboard()).kpi.totalAssociations).toBe(5);
  });
});
