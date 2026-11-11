import { createECDH, randomBytes } from 'node:crypto';
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
/** Clés d'un appareil, au format du navigateur (P-256 non compressée, secret de 16 octets, base64url). */
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const keys = { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
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

  it('au plus 10 appareils actifs : le plus ancien est désactivé, celui qu’on enregistre reste actif', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await subscribe(f.tokens.moussa, endpoint(`appareil-${String(i).padStart(2, '0')}`));
      expect(res.status).toBe(201);
      ids.push(((await res.json()) as { id: string }).id);
      // Ordre de création distinct pour chaque appareil.
      await f.h.superuser(
        `UPDATE push_subscriptions SET created_at = now() - make_interval(mins => $2) WHERE id = $1`,
        [ids[i], 100 - i],
      );
    }
    const active = (await rows()).filter((r) => r.revoked_at === null).map((r) => r.id);
    expect(active).toHaveLength(10);
    expect(active).not.toContain(ids[0]);
    expect(active).toContain(ids[10]);
    // Réactiver le plus ancien : il reste actif, c'est le suivant qui part.
    expect((await subscribe(f.tokens.moussa, endpoint('appareil-00'))).status).toBe(201);
    const after = (await rows()).filter((r) => r.revoked_at === null).map((r) => r.id);
    expect(after).toHaveLength(10);
    expect(after).toContain(ids[0]);
    expect(after).not.toContain(ids[1]);
  });

  it('clés hors format du navigateur ou URL trop longue : 422, rien d’enregistré', async () => {
    for (const body of [
      { endpoint: endpoint('x'), keys: { p256dh: 'court', auth: keys.auth } },
      { endpoint: endpoint('x'), keys: { p256dh: keys.p256dh, auth: 'a'.repeat(200) } },
      { endpoint: endpoint('x'.repeat(2100)), keys },
    ]) {
      const res = await fetch(`${f.base}/me/push-subscriptions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${f.tokens.moussa}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(422);
    }
    expect(await rows()).toEqual([]);
  });

  it('URL hors des services de push connus (adresse interne, http, identifiants) : 422, rien d’enregistré', async () => {
    for (const url of [
      'http://169.254.169.254/latest/meta-data',
      'https://redis:6379/x',
      'http://fcm.googleapis.com/fcm/send/x',
      'https://user:pw@fcm.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com.attaquant.example/x',
      'https://fcm.googleapis.com:8443/x',
    ]) {
      const res = await subscribe(f.tokens.moussa, url);
      expect(res.status, url).toBe(422);
      expect(await res.json()).toMatchObject({ fields: { endpoint: 'unsupported_push_service' } });
    }
    expect(await rows()).toEqual([]);
  });
});
