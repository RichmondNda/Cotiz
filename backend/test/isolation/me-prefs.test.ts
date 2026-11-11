import webpush from 'web-push';
import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type MembersFixture, startMembersFixture } from '../integration/members.fixture.js';
import { USERS } from './harness.js';

/**
 * Lot 4.2 · étape 4 : isolation et règles de me.prefs (réglages de notification par type et canal). Chacun ne lit et
 * n'écrit que les siens ; politique élargie (`owner_access` à `true`) : le filtre du code sur la personne tient seul.
 * Sans ligne : activé ; cloche d'un type « action requise » : jamais coupée.
 */

const Prefs = ENDPOINTS['me.prefs'].operations.get.response.body;
const everyone = { using: 'true', withCheck: 'true' };

describe('isolation : préférences de notification (me.prefs)', () => {
  let f: MembersFixture;
  let fatou: string;
  const vapid = webpush.generateVAPIDKeys();

  const get = async (token: string) => {
    const res = await fetch(`${f.base}/me/notification-preferences`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    return Prefs.parse(await res.json());
  };
  const put = (token: string, items: { type: string; channel: string; enabled: boolean }[]) =>
    fetch(`${f.base}/me/notification-preferences`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  const enabled = (
    p: { items: { type: string; channel: string; enabled: boolean }[] },
    type: string,
    channel: string,
  ) => p.items.find((i) => i.type === type && i.channel === channel)?.enabled;
  const stored = async () =>
    (await f.h.superuser(`SELECT user_id, type, channel, enabled FROM notification_preferences ORDER BY 1, 2, 3`))
      .rows as { user_id: string; type: string; channel: string; enabled: boolean }[];

  beforeAll(async () => {
    f = await startMembersFixture({ VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey });
    fatou = await f.login('subscriber', 'fatou@test.cotiz.app');
  });

  afterAll(async () => {
    await f.stop();
  });

  beforeEach(async () => {
    await f.h.superuser('DELETE FROM notification_preferences');
  });

  it('sans jeton : 401', async () => {
    expect((await fetch(`${f.base}/me/notification-preferences`)).status).toBe(401);
  });

  it('par défaut : tout activé, canaux proposés in_app et push, push seulement là où la matrice le prévoit', async () => {
    const p = await get(f.tokens.moussa);
    expect(p.availableChannels).toEqual(['in_app', 'push']);
    expect(p.items.every((i) => i.enabled)).toBe(true);
    expect(enabled(p, 'payment.validated', 'push')).toBe(true);
    // Paiement annulé : cloche seulement (architecture/07).
    expect(enabled(p, 'payment.reverted', 'push')).toBeUndefined();
    expect(p.items.some((i) => i.channel === 'sms' || i.channel === 'email')).toBe(false);
  });

  it('cloche d’un type « action requise » : reste activée même envoyée coupée ; son push se coupe', async () => {
    const res = await put(f.tokens.moussa, [
      { type: 'payment.rejected', channel: 'in_app', enabled: false },
      { type: 'payment.rejected', channel: 'push', enabled: false },
      { type: 'payment.validated', channel: 'in_app', enabled: false },
    ]);
    expect(res.status).toBe(200);
    const p = Prefs.parse(await res.json());
    expect(enabled(p, 'payment.rejected', 'in_app')).toBe(true);
    expect(enabled(p, 'payment.rejected', 'push')).toBe(false);
    expect(enabled(p, 'payment.validated', 'in_app')).toBe(false);
    expect(await stored()).toEqual([
      { user_id: USERS.moussa, type: 'payment.rejected', channel: 'in_app', enabled: true },
      { user_id: USERS.moussa, type: 'payment.rejected', channel: 'push', enabled: false },
      { user_id: USERS.moussa, type: 'payment.validated', channel: 'in_app', enabled: false },
    ]);
  });

  it('type ou canal non proposé : 422, rien d’enregistré', async () => {
    for (const items of [
      [{ type: 'inconnu', channel: 'in_app', enabled: false }],
      [{ type: 'payment.reverted', channel: 'push', enabled: false }],
      [{ type: 'payment.validated', channel: 'sms', enabled: false }],
    ]) {
      expect((await put(f.tokens.moussa, items)).status).toBe(422);
    }
    expect(await stored()).toEqual([]);
  });

  for (const widened of [false, true]) {
    const label = widened ? ' (politique élargie : le code filtre seul)' : '';
    const run = <T>(fn: () => Promise<T>) =>
      widened ? f.h.withPolicy('notification_preferences', 'owner_access', everyone, fn) : fn();

    it(`chacun ne lit et ne modifie que ses réglages${label}`, async () => {
      await put(fatou, [{ type: 'payment.validated', channel: 'push', enabled: false }]);
      await run(async () => {
        expect(enabled(await get(f.tokens.moussa), 'payment.validated', 'push')).toBe(true);
        expect(
          (await put(f.tokens.moussa, [{ type: 'payment.validated', channel: 'push', enabled: true }])).status,
        ).toBe(200);
        expect(enabled(await get(fatou), 'payment.validated', 'push')).toBe(false);
      });
      expect(await stored()).toEqual(
        [
          { user_id: USERS.fatou, type: 'payment.validated', channel: 'push', enabled: false },
          { user_id: USERS.moussa, type: 'payment.validated', channel: 'push', enabled: true },
        ].sort((a, b) => a.user_id.localeCompare(b.user_id)),
      );
    });
  }
});
