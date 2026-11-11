import { ENDPOINTS } from '@cotiz/contracts';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_STREAMS_PER_USER,
  notificationChannelOf,
  NotificationStreamHub,
} from '../../src/modules/notifications/infra/notification-bus.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type MembersFixture, startMembersFixture } from './members.fixture.js';

/**
 * Lot 4.2 · étape 2 : nt.stream. Flux SSE de la personne du jeton, dans l'espace courant : le worker publie l'id de
 * chaque notification créée sur `notifications:user:<id>` (Redis Pub/Sub), l'api relit la ligne avec le périmètre de
 * nt.list avant de l'envoyer (jamais une notification d'une autre personne ni d'un autre espace) ; reprise par
 * `Last-Event-ID`. Jeu : Awa owner de A et souscriptrice de B ; Moussa souscripteur de A ; Fatou souscriptrice de B.
 */

const Notification = ENDPOINTS['nt.stream'].operations.stream.response.body;

/** Battement réduit pour le test (25 s en production). */
const HEARTBEAT_MS = 400;

let seq = 0;
/** UUID v7 croissants (l'ordre des ids est celui de la reprise). */
const nid = () => `0196f000-0000-7000-8000-${(++seq).toString(16).padStart(12, '0')}`;

interface SseEvent {
  id?: string;
  event?: string;
  data?: string;
}

/** Lecteur de flux SSE (le navigateur lira de la même façon, par fetch : EventSource n'envoie pas d'en-tête). */
class Stream {
  readonly events: SseEvent[] = [];
  readonly comments: string[] = [];
  private buffer = '';
  private waiters: (() => void)[] = [];
  closed = false;

  constructor(
    readonly response: Response,
    private readonly controller: AbortController,
  ) {
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (!this.response.body) {
      this.closed = true;
      return;
    }
    const reader = this.response.body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        this.buffer += value;
        let end: number;
        while ((end = this.buffer.indexOf('\n\n')) >= 0) {
          const block = this.buffer.slice(0, end);
          this.buffer = this.buffer.slice(end + 2);
          const event: SseEvent = {};
          for (const line of block.split('\n')) {
            if (line.startsWith(':')) {
              this.comments.push(line.slice(1).trim());
              continue;
            }
            const colon = line.indexOf(':');
            const field = colon < 0 ? line : line.slice(0, colon);
            const text = colon < 0 ? '' : line.slice(colon + 1).trimStart();
            if (field === 'id' || field === 'event' || field === 'data') event[field] = text;
          }
          if (event.data !== undefined) this.events.push(event);
          this.wake();
        }
      }
    } catch {
      // flux interrompu par le test
    } finally {
      this.closed = true;
      this.wake();
    }
  }

  private wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((w) => {
      w();
    });
  }

  /** Attend que `predicate` soit vrai (au plus `ms`). */
  async until(predicate: () => boolean, ms = 3_000): Promise<boolean> {
    const deadline = Date.now() + ms;
    while (!predicate()) {
      const left = deadline - Date.now();
      if (left <= 0 || this.closed) return predicate();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    return true;
  }

  ready(): Promise<boolean> {
    return this.until(() => this.comments.includes('ok'));
  }

  ids(): string[] {
    return this.events.map((e) => e.id ?? '');
  }

  close(): void {
    this.controller.abort();
  }
}

describe('nt.stream', () => {
  let f: MembersFixture;
  let publisher: Redis;
  let awaSubscriber: string;
  const open: Stream[] = [];

  const connect = async (token: string, lastEventId?: string) => {
    const controller = new AbortController();
    const response = await fetch(`${f.base}/me/notifications/stream`, {
      headers: { authorization: `Bearer ${token}`, ...(lastEventId ? { 'last-event-id': lastEventId } : {}) },
      signal: controller.signal,
    });
    const stream = new Stream(response, controller);
    open.push(stream);
    return stream;
  };

  /** Notification écrite comme le fait le worker (canal in_app), puis annoncée comme lui après le COMMIT. */
  const put = async (
    userId: string,
    associationId: string | null,
    audience: 'subscriber' | 'manager' | 'platform',
    options: { announce?: boolean; channelOf?: string } = {},
  ) => {
    const id = nid();
    await f.h.superuser(
      `INSERT INTO notifications (id, user_id, association_id, type, title, body, action_url, data)
       VALUES ($1, $2, $3, 'payment.validated', 'Paiement validé', 'Texte', '/projets/x',
               jsonb_build_object('audience', $4::text))`,
      [id, userId, associationId, audience],
    );
    if (options.announce !== false) {
      await publisher.publish(notificationChannelOf(options.channelOf ?? userId), id);
    }
    return id;
  };

  beforeAll(async () => {
    f = await startMembersFixture({ NT_STREAM_HEARTBEAT_MS: String(HEARTBEAT_MS) });
    publisher = new Redis(f.redis.getConnectionUrl());
    awaSubscriber = await f.login('subscriber', 'awa@test.cotiz.app');
  });

  afterAll(async () => {
    open.forEach((s) => {
      s.close();
    });
    publisher.disconnect();
    await f.stop();
  });

  beforeEach(async () => {
    open.splice(0).forEach((s) => {
      s.close();
    });
    await f.h.superuser('DELETE FROM notifications');
  });

  it('sans jeton : 401, aucun flux', async () => {
    const res = await fetch(`${f.base}/me/notifications/stream`);
    expect(res.status).toBe(401);
  });

  it('flux SSE : en-têtes, puis la notification créée arrive en moins de 2 s, sans recharger', async () => {
    const stream = await connect(f.tokens.moussa);
    expect(stream.response.status).toBe(200);
    expect(stream.response.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(stream.response.headers.get('cache-control')).toMatch(/no-store/);
    // Le flux est prêt (abonnement Redis posé) dès le commentaire d'ouverture.
    expect(await stream.ready()).toBe(true);

    const started = Date.now();
    const id = await put(USERS.moussa, A.id, 'subscriber');
    expect(await stream.until(() => stream.ids().includes(id), 2_000)).toBe(true);
    expect(Date.now() - started).toBeLessThan(2_000);

    const event = stream.events.find((e) => e.id === id);
    expect(event?.event).toBe('notification');
    const body = Notification.parse(JSON.parse(event?.data ?? 'null'));
    expect(body).toMatchObject({ id, type: 'payment.validated', title: 'Paiement validé', readAt: null });
    // `audience` reste interne, comme dans nt.list.
    expect(body.data).toEqual({});
  });

  it('une notification d’une autre personne n’est jamais envoyée, même annoncée sur mon canal', async () => {
    const stream = await connect(f.tokens.moussa);
    await stream.ready();
    await put(USERS.fatou, B.id, 'subscriber', { channelOf: USERS.moussa });
    const mine = await put(USERS.moussa, A.id, 'subscriber');
    await stream.until(() => stream.ids().includes(mine));
    expect(stream.ids()).toEqual([mine]);
  });

  it('espace courant : la cloche de gestion n’arrive pas dans le flux de souscripteur, et inversement', async () => {
    const manager = await connect(f.tokens.awa);
    const subscriber = await connect(awaSubscriber);
    await Promise.all([manager.ready(), subscriber.ready()]);
    const forManager = await put(USERS.awa, A.id, 'manager');
    const forSubscriber = await put(USERS.awa, B.id, 'subscriber');
    await manager.until(() => manager.ids().includes(forManager));
    await subscriber.until(() => subscriber.ids().includes(forSubscriber));
    expect(manager.ids()).toEqual([forManager]);
    expect(subscriber.ids()).toEqual([forSubscriber]);
  });

  it('reprise avec Last-Event-ID : les notifications manquées, dans l’ordre, puis le direct', async () => {
    const seen = await put(USERS.moussa, A.id, 'subscriber', { announce: false });
    const missed1 = await put(USERS.moussa, A.id, 'subscriber', { announce: false });
    await put(USERS.fatou, B.id, 'subscriber', { announce: false });
    await put(USERS.moussa, A.id, 'manager', { announce: false });
    const missed2 = await put(USERS.moussa, A.id, 'subscriber', { announce: false });

    const stream = await connect(f.tokens.moussa, seen);
    expect(await stream.until(() => stream.ids().length >= 2)).toBe(true);
    await stream.ready();
    const live = await put(USERS.moussa, A.id, 'subscriber');
    await stream.until(() => stream.ids().includes(live));
    expect(stream.ids()).toEqual([missed1, missed2, live]);
  });

  it('sans Last-Event-ID, ou avec un identifiant illisible : rien n’est rejoué', async () => {
    await put(USERS.moussa, A.id, 'subscriber', { announce: false });
    for (const lastEventId of [undefined, 'pas-un-uuid']) {
      const stream = await connect(f.tokens.moussa, lastEventId);
      expect(stream.response.status).toBe(200);
      await stream.ready();
      const live = await put(USERS.moussa, A.id, 'subscriber');
      await stream.until(() => stream.ids().includes(live));
      expect(stream.ids()).toEqual([live]);
      stream.close();
    }
  });

  it('une notification annoncée deux fois n’est envoyée qu’une fois', async () => {
    const stream = await connect(f.tokens.moussa);
    await stream.ready();
    const id = await put(USERS.moussa, A.id, 'subscriber');
    await publisher.publish(notificationChannelOf(USERS.moussa), id);
    const after = await put(USERS.moussa, A.id, 'subscriber');
    await stream.until(() => stream.ids().includes(after));
    expect(stream.ids()).toEqual([id, after]);
  });

  it('gestion : une notification de gestion d’une autre association n’arrive pas dans le flux de gestion', async () => {
    // Awa gère A seulement (souscriptrice de B).
    const stream = await connect(f.tokens.awa);
    await stream.ready();
    await put(USERS.awa, B.id, 'manager');
    const mine = await put(USERS.awa, A.id, 'manager');
    await stream.until(() => stream.ids().includes(mine));
    expect(stream.ids()).toEqual([mine]);
  });

  it('appartenance retirée pendant le flux : plus rien n’arrive, aussitôt', async () => {
    const stream = await connect(f.tokens.aminata);
    await stream.ready();
    const before = await put(USERS.aminata, A.id, 'manager');
    await stream.until(() => stream.ids().includes(before));
    await f.h.superuser(
      `UPDATE memberships SET status = 'removed', removed_at = now() WHERE association_id = $1 AND user_id = $2`,
      [A.id, USERS.aminata],
    );
    try {
      await put(USERS.aminata, A.id, 'manager');
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(stream.ids()).toEqual([before]);
    } finally {
      await f.h.superuser(
        `UPDATE memberships SET status = 'active', removed_at = NULL WHERE association_id = $1 AND user_id = $2`,
        [A.id, USERS.aminata],
      );
    }
  });

  it('au plus 5 flux par personne : le plus ancien est fermé ; à la fermeture, plus d’abonnement Redis', async () => {
    const hub = f.app.get(NotificationStreamHub);
    const streams: Stream[] = [];
    for (let i = 0; i < MAX_STREAMS_PER_USER + 1; i++) {
      const s = await connect(f.tokens.moussa);
      await s.ready();
      streams.push(s);
    }
    expect(await streams[0]?.until(() => streams[0]?.closed ?? false)).toBe(true);
    expect(streams.slice(1).every((s) => !s.closed)).toBe(true);
    expect(hub.openStreams(USERS.moussa)).toBe(MAX_STREAMS_PER_USER);

    streams.forEach((s) => {
      s.close();
    });
    await expect.poll(() => hub.openStreams(USERS.moussa)).toBe(0);
    await expect
      .poll(
        async () => (await f.redis.exec(['redis-cli', 'PUBSUB', 'NUMSUB', notificationChannelOf(USERS.moussa)])).output,
      )
      .toMatch(/\n0\s*$/);
  });

  it('aucune connexion à la base tenue par les flux : plus de flux que le pool, l’api répond encore', async () => {
    // Pool de 10 connexions (DATABASE_POOL_MAX) ; 15 flux de trois personnes.
    const tokens = [f.tokens.moussa, f.tokens.awa, f.tokens.aminata];
    const streams = await Promise.all(
      Array.from({ length: 15 }, (_, i) => connect(tokens[i % tokens.length] ?? f.tokens.moussa)),
    );
    await Promise.all(streams.map((s) => s.ready()));
    const started = Date.now();
    const res = await f.call('/me/notifications/unread-count', { token: f.tokens.koffi });
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('battement de cœur : un commentaire à intervalle régulier', async () => {
    const stream = await connect(f.tokens.moussa);
    expect(await stream.until(() => stream.comments.filter((c) => c === 'ping').length >= 2, 3_000)).toBe(true);
  });

  it('session révoquée (déconnexion) : le flux se ferme au battement suivant', async () => {
    const token = await f.login('subscriber', 'awa@test.cotiz.app');
    const stream = await connect(token);
    await stream.ready();
    expect((await f.call('/auth/logout', { token, method: 'POST' })).status).toBeLessThan(300);
    expect(await stream.until(() => stream.closed, 3_000)).toBe(true);
  });
});
