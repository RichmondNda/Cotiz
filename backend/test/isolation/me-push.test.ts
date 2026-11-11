import webpush from 'web-push';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type MembersFixture, startMembersFixture } from '../integration/members.fixture.js';
import { USERS } from './harness.js';

/**
 * Lot 4.2 · étape 3 : isolation de me.push (abonnements Web Push, un par appareil). Chacun n'enregistre, ne réactive et
 * ne désactive que ses appareils ; l'URL d'un appareil déjà enregistrée par une autre personne (appareil partagé) est
 * refusée sans rien lire ni modifier chez elle ; l'URL d'un appareil d'autrui n'est jamais renvoyée. Politique élargie
 * (`owner_access` à `true`) : le filtre du code sur la personne tient seul.
 */

const everyone = { using: 'true', withCheck: 'true' };
const keys = {
  p256dh: 'BOr4nd0mP256dhKeyForTestsOnly_abcdefghijklmnopqrstuvwxyz0123456789',
  auth: 'YXV0aHNlY3JldDE2Ynl0',
};
const endpoint = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;

describe('isolation : abonnements Web Push (me.push)', () => {
  let f: MembersFixture;
  let fatou: string;
  const vapid = webpush.generateVAPIDKeys();

  const subscribe = (token: string, url: string) =>
    fetch(`${f.base}/me/push-subscriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: url, keys }),
    });
  const unsubscribe = (token: string, id: string) =>
    fetch(`${f.base}/me/push-subscriptions/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
  const rows = async () =>
    (
      await f.h.superuser(
        `SELECT id, user_id, endpoint, p256dh, revoked_at, failed_count FROM push_subscriptions ORDER BY endpoint`,
      )
    ).rows as {
      id: string;
      user_id: string;
      endpoint: string;
      p256dh: string;
      revoked_at: Date | null;
      failed_count: number;
    }[];

  beforeAll(async () => {
    f = await startMembersFixture({ VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey });
    fatou = await f.login('subscriber', 'fatou@test.cotiz.app');
  });

  afterAll(async () => {
    await f.stop();
  });

  beforeEach(async () => {
    await f.h.superuser('DELETE FROM push_subscriptions');
  });

  it('clé publique VAPID : connecté seulement, la clé publique et rien d’autre', async () => {
    expect((await fetch(`${f.base}/public/push/vapid-public-key`)).status).toBe(401);
    const res = await fetch(`${f.base}/public/push/vapid-public-key`, {
      headers: { authorization: `Bearer ${f.tokens.moussa}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ publicKey: vapid.publicKey });
  });

  it('abonnement : sans jeton 401 ; enregistré pour la personne du jeton, jamais pour une autre', async () => {
    expect((await fetch(`${f.base}/me/push-subscriptions`, { method: 'POST' })).status).toBe(401);
    const res = await subscribe(f.tokens.moussa, endpoint('moussa'));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(await rows()).toMatchObject([{ id: body.id, user_id: USERS.moussa, endpoint: endpoint('moussa') }]);
  });

  for (const widened of [false, true]) {
    const label = widened ? ' (politique élargie : le code filtre seul)' : '';
    const run = <T>(fn: () => Promise<T>) =>
      widened ? f.h.withPolicy('push_subscriptions', 'owner_access', everyone, fn) : fn();

    it(`appareil déjà enregistré par une autre personne : 422, rien ne change chez elle${label}`, async () => {
      const own = (await (await subscribe(fatou, endpoint('partage'))).json()) as { id: string };
      await f.h.superuser(`UPDATE push_subscriptions SET failed_count = 3, revoked_at = now() WHERE id = $1`, [own.id]);
      const before = await rows();
      await run(async () => {
        const res = await subscribe(f.tokens.moussa, endpoint('partage'));
        expect(res.status).toBe(422);
        const problem = (await res.json()) as { code: string; fields?: Record<string, string> };
        expect(problem).toMatchObject({ code: 'validation_failed', fields: { endpoint: 'already_registered' } });
        // Aucune information sur l'autre appareil dans la réponse.
        expect(JSON.stringify(problem)).not.toContain(own.id);
      });
      expect(await rows()).toEqual(before);
    });

    it(`réabonnement du même appareil par la même personne : même ligne, réactivée${label}`, async () => {
      const first = (await (await subscribe(f.tokens.moussa, endpoint('moussa'))).json()) as { id: string };
      await f.h.superuser(`UPDATE push_subscriptions SET failed_count = 4, revoked_at = now()`);
      await run(async () => {
        const res = await subscribe(f.tokens.moussa, endpoint('moussa'));
        expect(res.status).toBe(201);
        expect(((await res.json()) as { id: string }).id).toBe(first.id);
      });
      expect(await rows()).toMatchObject([{ id: first.id, user_id: USERS.moussa, revoked_at: null, failed_count: 0 }]);
    });

    it(`désabonnement : le sien 204 ; celui d’autrui 404, intact${label}`, async () => {
      const mine = (await (await subscribe(f.tokens.moussa, endpoint('moussa'))).json()) as { id: string };
      const other = (await (await subscribe(fatou, endpoint('fatou'))).json()) as { id: string };
      await run(async () => {
        expect((await unsubscribe(f.tokens.moussa, other.id)).status).toBe(404);
        expect((await unsubscribe(f.tokens.moussa, mine.id)).status).toBe(204);
        // Déjà désactivé : plus rien à désactiver.
        expect((await unsubscribe(f.tokens.moussa, mine.id)).status).toBe(404);
      });
      const byId = new Map((await rows()).map((r) => [r.id, r]));
      expect(byId.get(other.id)?.revoked_at).toBeNull();
      expect(byId.get(mine.id)?.revoked_at).toBeInstanceOf(Date);
    });
  }

  it('URL hors des services de push connus (adresse interne, http, identifiants) : 422, rien d’enregistré', async () => {
    for (const url of [
      'http://169.254.169.254/latest/meta-data',
      'https://redis:6379/x',
      'http://fcm.googleapis.com/fcm/send/x',
      'https://user:pw@fcm.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com.attaquant.example/x',
    ]) {
      const res = await subscribe(f.tokens.moussa, url);
      expect(res.status, url).toBe(422);
      expect(await res.json()).toMatchObject({ fields: { endpoint: 'unsupported_push_service' } });
    }
    expect(await rows()).toEqual([]);
  });
});
