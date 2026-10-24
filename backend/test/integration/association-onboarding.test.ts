import { Association } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, USERS } from '../isolation/harness.js';
import { codeOf, D, OWNERS, type PlatformFixture, startPlatformFixture } from './platform-associations.fixture.js';

/**
 * Lot 2.1 · étape 3 : clôture de l'onboarding (as.onb). Avancement non mémorisé, déduit des données (choix Q1) : le
 * profil est toujours complet (colonnes obligatoires), il faut au moins un moyen de paiement actif, sinon 422
 * `onboarding_incomplete` (vérification de l'étape). Clôture (Q2) : date posée, `onboarding → active`, version
 * incrémentée, association.onboarded ; un second appel ne change rien et n'émet rien.
 */

describe('clôture de l’onboarding (as.onb)', () => {
  let f: PlatformFixture;
  /** Owner de D (onboarding). */
  let yao: string;
  /** Owner de A (active, onboarding jamais clos dans le jeu de test). */
  let awa: string;
  /** Owner de B, viewer de A. */
  let koffi: string;
  /** Souscripteur de A. */
  let moussa: string;

  const complete = (aid: string, token: string) =>
    f.call(`/associations/${aid}/onboarding/complete`, { token, method: 'POST' });
  const row = async (id: string) =>
    (await f.h.superuser('SELECT status, onboarding_completed_at, version FROM associations WHERE id = $1', [id]))
      .rows[0] as { status: string; onboarding_completed_at: Date | null; version: number };
  const events = async (id: string) =>
    (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, payload FROM outbox_events
          WHERE event_type = 'association.onboarded' AND aggregate_id = $1 ORDER BY id`,
        [id],
      )
    ).rows as Record<string, unknown>[];
  const addMethod = (aid: string, isActive: boolean) =>
    f.h.superuser(
      `INSERT INTO association_payment_methods (id, association_id, kind, label, instructions, is_active)
       VALUES (gen_random_uuid(), $1, 'cash', 'Espèces', 'Remise au trésorier', $2)`,
      [aid, isActive],
    );

  beforeAll(async () => {
    f = await startPlatformFixture();
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       VALUES (gen_random_uuid(), $1, $2, 'viewer', 'active', now())`,
      [A.id, USERS.koffi],
    );
    [yao, awa, koffi, moussa] = await Promise.all([
      f.login('association', OWNERS.yao.email),
      f.login('association', 'awa@test.cotiz.app'),
      f.login('association', 'koffi@test.cotiz.app'),
      f.login('subscriber', 'moussa@test.cotiz.app'),
    ]);
  });

  afterAll(() => f.stop());

  beforeEach(async () => {
    await f.h.superuser(
      `UPDATE associations SET status = 'onboarding', onboarding_completed_at = NULL, version = 1 WHERE id = $1`,
      [D],
    );
    await f.h.superuser(
      `UPDATE associations SET status = 'active', onboarding_completed_at = NULL, version = 1 WHERE id = $1`,
      [A.id],
    );
    await f.h.superuser('DELETE FROM association_payment_methods WHERE association_id IN ($1, $2)', [D, A.id]);
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type = 'association.onboarded'`);
  });

  it('aucun moyen de paiement : 422 onboarding_incomplete, rien ne change, aucun événement', async () => {
    const res = await complete(D, yao);
    expect(res.status).toBe(422);
    expect(await codeOf(res)).toBe('onboarding_incomplete');
    expect(await row(D)).toEqual({ status: 'onboarding', onboarding_completed_at: null, version: 1 });
    expect(await events(D)).toEqual([]);
  });

  it('seulement un moyen désactivé : 422 onboarding_incomplete, rien ne change, aucun événement', async () => {
    await addMethod(D, false);
    const res = await complete(D, yao);
    expect(res.status).toBe(422);
    expect(await codeOf(res)).toBe('onboarding_incomplete');
    expect(await row(D)).toEqual({ status: 'onboarding', onboarding_completed_at: null, version: 1 });
    expect(await events(D)).toEqual([]);
  });

  it('étapes obligatoires faites : association active, date posée, version incrémentée, événement', async () => {
    await addMethod(D, true);
    const before = Date.now();
    const res = await complete(D, yao);
    expect(res.status).toBe(200);
    const body = Association.parse(await res.json());
    expect(body).toMatchObject({ id: D, status: 'active', version: 2 });
    const completedAt = Date.parse(body.onboardingCompletedAt ?? '');
    expect(completedAt).toBeGreaterThanOrEqual(before - 1_000);
    expect(completedAt).toBeLessThanOrEqual(Date.now() + 1_000);
    const stored = await row(D);
    expect(stored).toMatchObject({ status: 'active', version: 2 });
    expect(stored.onboarding_completed_at?.toISOString()).toBe(body.onboardingCompletedAt);
    expect(await events(D)).toEqual([
      { association_id: D, actor_user_id: OWNERS.yao.id, payload: { associationId: D } },
    ]);
  });

  it('second appel : rien ne change, aucun nouvel événement', async () => {
    await addMethod(D, true);
    const first = Association.parse(await (await complete(D, yao)).json());
    const res = await complete(D, yao);
    expect(res.status).toBe(200);
    expect(Association.parse(await res.json())).toEqual(first);
    expect(await row(D)).toMatchObject({ status: 'active', version: 2 });
    expect(await events(D)).toHaveLength(1);
  });

  it('déjà close puis moyens désactivés : 200, renvoyée telle quelle (pas de 422)', async () => {
    await addMethod(D, true);
    const first = Association.parse(await (await complete(D, yao)).json());
    await f.h.superuser('UPDATE association_payment_methods SET is_active = false WHERE association_id = $1', [D]);
    const res = await complete(D, yao);
    expect(res.status).toBe(200);
    expect(Association.parse(await res.json())).toEqual(first);
    expect(await events(D)).toHaveLength(1);
  });

  it('deux clôtures simultanées : un seul événement, même date', async () => {
    await addMethod(D, true);
    const responses = await Promise.all([complete(D, yao), complete(D, yao)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const bodies = await Promise.all(responses.map(async (r) => Association.parse(await r.json())));
    expect(bodies[0]?.onboardingCompletedAt).toBe(bodies[1]?.onboardingCompletedAt);
    expect(await events(D)).toHaveLength(1);
    expect((await row(D)).version).toBe(2);
  });

  it('association déjà active sans onboarding clos : date posée, statut inchangé', async () => {
    await addMethod(A.id, true);
    const res = await complete(A.id, awa);
    expect(res.status).toBe(200);
    expect(Association.parse(await res.json())).toMatchObject({ status: 'active', version: 2 });
    expect((await row(A.id)).onboarding_completed_at).not.toBeNull();
    expect(await events(A.id)).toHaveLength(1);
  });

  it('association past_due : date posée, statut past_due conservé', async () => {
    await addMethod(A.id, true);
    await f.h.superuser(`UPDATE associations SET status = 'past_due' WHERE id = $1`, [A.id]);
    const res = await complete(A.id, awa);
    expect(res.status).toBe(200);
    expect(Association.parse(await res.json())).toMatchObject({ status: 'past_due', version: 2 });
    expect(await row(A.id)).toMatchObject({ status: 'past_due', version: 2 });
  });

  it('moyens désactivés pendant la clôture : elle attend le verrou des moyens et voit 0 moyen actif', async () => {
    await addMethod(D, true);
    // Remplacement concurrent (as.pm) : même verrou, tenu 0,4 s pendant la désactivation.
    const deactivating = f.h.superuser(
      `BEGIN;
       SELECT pg_advisory_xact_lock(hashtextextended('payment-methods:${D}', 0));
       UPDATE association_payment_methods SET is_active = false WHERE association_id = '${D}';
       SELECT pg_sleep(0.4);
       COMMIT;`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const res = await complete(D, yao);
    await deactivating;
    expect(res.status).toBe(422);
    expect(await row(D)).toEqual({ status: 'onboarding', onboarding_completed_at: null, version: 1 });
  });

  it('viewer : 403 ; association d’un autre : 404 ; rien ne change', async () => {
    await addMethod(A.id, true);
    await addMethod(D, true);
    expect((await complete(A.id, koffi)).status).toBe(403);
    expect((await complete(D, awa)).status).toBe(404);
    expect(await row(A.id)).toMatchObject({ onboarding_completed_at: null, version: 1 });
    expect(await row(D)).toMatchObject({ status: 'onboarding', version: 1 });
    expect(await events(A.id)).toEqual([]);
    expect(await events(D)).toEqual([]);
  });

  it('isolation : un moyen actif dans une autre association ne compte pas', async () => {
    await addMethod(A.id, true);
    const res = await complete(D, yao);
    expect(res.status).toBe(422);
    expect(await codeOf(res)).toBe('onboarding_incomplete');
    expect(await row(D)).toEqual({ status: 'onboarding', onboarding_completed_at: null, version: 1 });
    expect(await events(D)).toEqual([]);
  });

  it('isolation, politique tenant_isolation élargie : le filtre du code suffit, le moyen de A ne compte pas', async () => {
    await addMethod(A.id, true);
    const res = await f.h.withPolicy(
      'association_payment_methods',
      'tenant_isolation',
      { using: 'true', withCheck: 'true' },
      () => complete(D, yao),
    );
    expect(res.status).toBe(422);
    expect(await codeOf(res)).toBe('onboarding_incomplete');
    expect(await row(D)).toEqual({ status: 'onboarding', onboarding_completed_at: null, version: 1 });
  });

  it('association suspendue : 403 association_suspended ; jeton souscripteur : 404 ; rien ne change', async () => {
    await addMethod(D, true);
    await f.h.superuser(`UPDATE associations SET status = 'suspended' WHERE id = $1`, [D]);
    const suspended = await complete(D, yao);
    expect(suspended.status).toBe(403);
    expect(await codeOf(suspended)).toBe('association_suspended');
    expect(await row(D)).toEqual({ status: 'suspended', onboarding_completed_at: null, version: 1 });
    expect((await complete(A.id, moussa)).status).toBe(404);
    expect(await events(D)).toEqual([]);
    expect(await events(A.id)).toEqual([]);
  });
});
