import { AssociationSubscription } from '@cotiz/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import {
  codeOf,
  D,
  OWNERS,
  PLANS,
  type PlatformFixture,
  startPlatformFixture,
  SUBS,
} from './platform-associations.fixture.js';

/**
 * Lot 2.1 · étape 4 : abonnement de l'association vu par ses gestionnaires (bl.sub) : plan, période, prix au tarif
 * actuel, quotas et usage. Vérification de l'étape : réponse conforme au contrat. Choix du lot : abonnement en cours, à
 * défaut le plus récent ; aucun → 404 (Q8). Usage compté comme QuotaService (Q7) : gestionnaires = owner, manager et
 * viewer invités ou actifs ; souscripteurs non retirés ; projets en brouillon, inscriptions ouvertes ou en cours (lot 2.2, Q6).
 */

const xof = (amount: number) => ({ amount, currency: 'XOF' });
const DIDI = '00000000-0000-7000-8000-0000000015e1';
const ALI = '00000000-0000-7000-8000-0000000015e2';

describe('abonnement de l’association (bl.sub)', () => {
  let f: PlatformFixture;
  /** Owner de A. */
  let awa: string;
  /** Owner de B, viewer de A. */
  let koffi: string;
  /** Owner de D. */
  let yao: string;

  const subscription = (aid: string, token: string) => f.call(`/associations/${aid}/subscription`, { token });
  const read = async (aid: string, token: string) => {
    const res = await subscription(aid, token);
    expect(res.status).toBe(200);
    return AssociationSubscription.parse(await res.json());
  };

  beforeAll(async () => {
    f = await startPlatformFixture();
    // A : Awa owner, Koffi viewer, Aminata manager invitée (comptée), Fatou manager retirée (non comptée).
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at) VALUES
         (gen_random_uuid(), $1, $2, 'viewer', 'active', now())`,
      [A.id, USERS.koffi],
    );
    await f.h.superuser(
      `UPDATE memberships SET role = 'manager', status = 'invited' WHERE association_id = $1 AND user_id = $2`,
      [A.id, USERS.aminata],
    );
    await f.h.superuser(
      `UPDATE memberships SET role = 'manager', status = 'removed' WHERE association_id = $1 AND user_id = $2`,
      [A.id, USERS.fatou],
    );
    // A : Didi souscripteur invité (compté), Ali souscripteur retiré (non compté).
    await f.h.superuser(
      `INSERT INTO users (id, email, first_name, last_name, status) VALUES
         ($1, 'didi@test.cotiz.app', 'Didi', 'Yao', 'active'),
         ($2, 'ali@test.cotiz.app', 'Ali', 'Traoré', 'active')`,
      [DIDI, ALI],
    );
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status) VALUES
         (gen_random_uuid(), $1, $2, 'subscriber', 'invited'),
         (gen_random_uuid(), $1, $3, 'subscriber', 'removed')`,
      [A.id, DIDI, ALI],
    );
    // A : un brouillon et un projet en cours comptés, un projet terminé non compté (Q6) ; B : non compté pour A.
    await f.h.superuser(
      `INSERT INTO projects (id, association_id, name, description, status, installment_amount, frequency, due_day,
                             schedule_type, start_date, created_by)
       SELECT gen_random_uuid(), a, 'P', '', s::projects_status, 1000, 'monthly', 5, 'rolling', '2026-01-01', $3
         FROM (VALUES ($1::uuid, 'draft'), ($1::uuid, 'active'), ($1::uuid, 'completed'), ($2::uuid, 'draft')) AS p(a, s)`,
      [A.id, B.id, USERS.awa],
    );
    [awa, koffi, yao] = await Promise.all([
      f.login('association', 'awa@test.cotiz.app'),
      f.login('association', 'koffi@test.cotiz.app'),
      f.login('association', OWNERS.yao.email),
    ]);
  });

  afterAll(() => f.stop());

  it('abonnement mensuel en cours : réponse conforme, prix mensuel, quotas et usage', async () => {
    expect(await read(A.id, awa)).toEqual({
      plan: {
        id: PLANS.essentiel,
        code: 'essentiel',
        name: 'Essentiel',
        description: null,
        priceMonthly: xof(10000),
        priceYearly: xof(120000),
        limits: { projects: 5, subscribers: 100, managers: 2 },
        features: [],
        isFeatured: false,
      },
      billingPeriod: 'monthly',
      status: 'active',
      price: xof(10000),
      currentPeriodStart: '2026-10-01',
      currentPeriodEnd: '2026-10-31',
      trialEndsOn: null,
      quotas: {
        projects: { used: 2, limit: 5 },
        // Moussa (actif), Didi (invité) ; Ali retiré ; Aminata et Fatou sont passées gestionnaires.
        subscribers: { used: 2, limit: 100 },
        // Awa (owner), Koffi (viewer), Aminata (manager invitée).
        managers: { used: 3, limit: 2 },
      },
    });
  });

  it('essai annuel : prix annuel, fin d’essai, surcharge des comptes gestionnaires, projets illimités', async () => {
    const sub = await read(B.id, koffi);
    expect(sub).toMatchObject({
      plan: { id: PLANS.pro, code: 'pro' },
      billingPeriod: 'yearly',
      status: 'trialing',
      price: xof(300000),
      currentPeriodStart: '2026-09-15',
      currentPeriodEnd: '2026-10-14',
      trialEndsOn: '2026-10-14',
      quotas: {
        projects: { used: 1, limit: null },
        // Fatou et Awa, souscriptrices de B.
        subscribers: { used: 2, limit: 500 },
        managers: { used: 1, limit: 3 },
      },
    });
  });

  it('viewer : lecture permise (association.read)', async () => {
    expect((await subscription(A.id, koffi)).status).toBe(200);
  });

  it('identifiant en majuscules : même abonnement', async () => {
    expect(await read(A.id.toUpperCase(), awa)).toEqual(await read(A.id, awa));
  });

  it('plus d’abonnement en cours : le plus récent, avec son statut et les limites de son plan', async () => {
    await f.h.superuser(`UPDATE subscriptions SET status = 'canceled' WHERE id = $1`, [SUBS.d]);
    // Un plus ancien, lui aussi terminé, sur un autre plan : jamais retenu.
    await f.h.superuser(
      `INSERT INTO subscriptions (id, association_id, plan_id, billing_period, status, current_period_start, created_at)
       VALUES ('00000000-0000-7000-8000-0000000015de', $1, $2, 'monthly', 'canceled', '2026-09-01', now() - interval '30 days')`,
      [D, PLANS.pro],
    );
    try {
      expect(await read(D, yao)).toMatchObject({
        status: 'canceled',
        plan: { id: PLANS.essentiel },
        quotas: { managers: { used: 1, limit: 2 } },
      });
    } finally {
      await f.h.superuser(`DELETE FROM subscriptions WHERE id = '00000000-0000-7000-8000-0000000015de'`);
      await f.h.superuser(`UPDATE subscriptions SET status = 'trialing' WHERE id = $1`, [SUBS.d]);
    }
  });

  it('abonnement en cours prioritaire sur un plus récent qui ne l’est plus', async () => {
    await f.h.superuser(
      `INSERT INTO subscriptions (id, association_id, plan_id, billing_period, status, current_period_start, created_at)
       VALUES ('00000000-0000-7000-8000-0000000015df', $1, $2, 'monthly', 'canceled', '2026-10-20', now() + interval '1 day')`,
      [D, PLANS.pro],
    );
    try {
      expect(await read(D, yao)).toMatchObject({ status: 'trialing', plan: { id: PLANS.essentiel } });
    } finally {
      await f.h.superuser(`DELETE FROM subscriptions WHERE id = '00000000-0000-7000-8000-0000000015df'`);
    }
  });

  it('aucun abonnement : 404', async () => {
    const { rows } = await f.h.superuser('DELETE FROM subscriptions WHERE id = $1 RETURNING *', [SUBS.d]);
    try {
      const res = await subscription(D, yao);
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
    } finally {
      const row = rows[0] as Record<string, unknown>;
      await f.h.superuser(
        `INSERT INTO subscriptions (id, association_id, plan_id, billing_period, status, current_period_start,
           current_period_end, trial_ends_at, manager_seats_override, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          row.id,
          row.association_id,
          row.plan_id,
          row.billing_period,
          row.status,
          row.current_period_start,
          row.current_period_end,
          row.trial_ends_at,
          row.manager_seats_override,
          row.created_at,
        ],
      );
    }
  });

  it('association suspendue : 403 association_suspended', async () => {
    await f.h.superuser(`UPDATE associations SET status = 'suspended' WHERE id = $1`, [D]);
    try {
      const res = await subscription(D, yao);
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('association_suspended');
    } finally {
      await f.h.superuser(`UPDATE associations SET status = 'onboarding' WHERE id = $1`, [D]);
    }
  });

  it('isolation : abonnement d’une association dont on n’est pas gestionnaire → 404', async () => {
    // Awa est souscriptrice de B ; Yao ne connaît pas A.
    expect((await subscription(B.id, awa)).status).toBe(404);
    expect((await subscription(A.id, yao)).status).toBe(404);
  });
});
