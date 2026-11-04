import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { type MembersFixture, startMembersFixture } from './members.fixture.js';
import { codeOf, STAFF } from './platform-associations.fixture.js';

/**
 * Lot 2.5 · étape 3 : nt.list (liste, compteur en cache Redis) et nt.read (une, toutes). La cloche de la personne du
 * jeton, dans l'espace courant : souscripteur → audience subscriber des associations où elle est souscriptrice active ;
 * association → audience manager de l'association courante (première gérée, comme GET /me) ; plateforme → audience
 * platform. Jeu : Awa owner de A et souscriptrice de B ; Moussa souscripteur de A ; Aminata manager de A.
 */

const Page = ENDPOINTS['nt.list'].operations.list.response.body;
const One = ENDPOINTS['nt.read'].operations.read.response.body;

let seq = 0;
const nid = () => `00000000-0000-7000-8000-0000000e${(++seq).toString(16).padStart(4, '0')}`;

describe('nt.list, nt.read', () => {
  let f: MembersFixture;
  let awaSubscriber: string;
  let richy: string;

  /** Notification posée en base, comme l'écrit le consommateur ; `at` : création (ordre des pages). */
  const put = async (
    userId: string,
    associationId: string | null,
    audience: 'subscriber' | 'manager' | 'platform',
    options: { type?: string; at?: string; read?: boolean } = {},
  ) => {
    const id = nid();
    await f.h.superuser(
      `INSERT INTO notifications (id, user_id, association_id, type, title, body, action_url, data, read_at, created_at)
       VALUES ($1, $2, $3, $4, 'Titre', 'Texte', '/x', jsonb_build_object('audience', $5::text, 'actionLabel', 'Voir'),
               CASE WHEN $6 THEN now() END, $7::timestamptz)`,
      [
        id,
        userId,
        associationId,
        options.type ?? 'payment.validated',
        audience,
        options.read ?? false,
        options.at ?? new Date().toISOString(),
      ],
    );
    return id;
  };
  const list = async (token: string, query = '') => {
    const res = await f.call(`/me/notifications${query}`, { token });
    expect(res.status).toBe(200);
    return Page.parse(await res.json());
  };
  const unread = async (token: string) => {
    const res = await f.call('/me/notifications/unread-count', { token });
    expect(res.status).toBe(200);
    return ((await res.json()) as { count: number }).count;
  };
  const read = (token: string, id: string) => f.call(`/me/notifications/${id}/read`, { token, method: 'POST' });
  const readAll = (token: string) => f.call('/me/notifications/read-all', { token, method: 'POST' });

  beforeAll(async () => {
    f = await startMembersFixture();
    [awaSubscriber, richy] = await Promise.all([
      f.login('subscriber', 'awa@test.cotiz.app'),
      f.login('platform', STAFF.owner.email),
    ]);
  });

  afterAll(async () => {
    await f.stop();
  });

  beforeEach(async () => {
    await f.h.superuser('DELETE FROM notifications');
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
  });

  describe('nt.list : espace courant', () => {
    it('souscripteur : ses notifications de souscripteur, jamais celles d’une autre personne', async () => {
      const mine = await put(USERS.moussa, A.id, 'subscriber');
      await put(USERS.fatou, B.id, 'subscriber');
      await put(USERS.awa, A.id, 'manager');
      const page = await list(f.tokens.moussa);
      expect(page.items.map((n) => n.id)).toEqual([mine]);
      expect(page.total).toBe(1);
      // `audience` reste interne ; le reste de `data` est servi.
      expect(page.items[0]?.data).toEqual({ actionLabel: 'Voir' });
    });

    it('personne à double rôle : la cloche de gestion de A et celle de souscriptrice de B, séparées', async () => {
      const manager = await put(USERS.awa, A.id, 'manager');
      const subscriber = await put(USERS.awa, B.id, 'subscriber');
      expect((await list(f.tokens.awa)).items.map((n) => n.id)).toEqual([manager]);
      expect((await list(awaSubscriber)).items.map((n) => n.id)).toEqual([subscriber]);
      expect(await unread(f.tokens.awa)).toBe(1);
      expect(await unread(awaSubscriber)).toBe(1);
    });

    it('plateforme : audience platform pour le personnel ; un gestionnaire n’y voit rien', async () => {
      const staff = await put(STAFF.owner.id, null, 'platform');
      expect((await list(richy)).items.map((n) => n.id)).toEqual([staff]);
      await put(USERS.awa, null, 'platform');
      expect((await list(f.tokens.awa)).items).toEqual([]);
    });

    it('ancien gestionnaire (appartenance retirée) : liste et compteur vides, lecture 404', async () => {
      const id = await put(USERS.aminata, A.id, 'manager');
      expect((await list(f.tokens.aminata)).total).toBe(1);
      // Mis en cache avant le retrait : le compteur ne doit pas survivre au changement d'espace courant.
      expect(await unread(f.tokens.aminata)).toBe(1);
      await f.h.superuser(
        `UPDATE memberships SET status = 'removed', removed_at = now() WHERE association_id = $1 AND user_id = $2`,
        [A.id, USERS.aminata],
      );
      try {
        expect((await list(f.tokens.aminata)).items).toEqual([]);
        expect(await unread(f.tokens.aminata)).toBe(0);
        expect((await read(f.tokens.aminata, id)).status).toBe(404);
        const { rows } = await f.h.superuser('SELECT read_at FROM notifications WHERE id = $1', [id]);
        expect(rows).toEqual([{ read_at: null }]);
      } finally {
        await f.h.superuser(
          `UPDATE memberships SET status = 'active', removed_at = NULL WHERE association_id = $1 AND user_id = $2`,
          [A.id, USERS.aminata],
        );
      }
    });

    it('notification de gestion d’une association que la personne ne gère pas : invisible, 404', async () => {
      // Awa gère A seulement (souscriptrice de B) : une notification « manager » de B n'apparaît nulle part.
      const foreign = await put(USERS.awa, B.id, 'manager');
      expect((await list(f.tokens.awa)).items).toEqual([]);
      expect((await list(awaSubscriber)).items).toEqual([]);
      expect(await unread(f.tokens.awa)).toBe(0);
      expect((await read(f.tokens.awa, foreign)).status).toBe(404);
      expect(await (await readAll(f.tokens.awa)).json()).toEqual({ updated: 0 });
    });

    it('notification de souscripteur d’une association où la personne n’est pas souscriptrice : invisible, 404', async () => {
      // Moussa est souscripteur de A seulement.
      const mine = await put(USERS.moussa, A.id, 'subscriber');
      const foreign = await put(USERS.moussa, B.id, 'subscriber');
      expect((await list(f.tokens.moussa)).items.map((n) => n.id)).toEqual([mine]);
      expect(await unread(f.tokens.moussa)).toBe(1);
      expect((await read(f.tokens.moussa, foreign)).status).toBe(404);
      expect(await (await readAll(f.tokens.moussa)).json()).toEqual({ updated: 1 });
      const { rows } = await f.h.superuser('SELECT read_at FROM notifications WHERE id = $1', [foreign]);
      expect(rows).toEqual([{ read_at: null }]);
    });

    it('filtres unread et type ; les plus récentes d’abord, pages par curseur', async () => {
      const old = await put(USERS.moussa, A.id, 'subscriber', { at: '2026-09-01T09:00:00Z', read: true });
      const mid = await put(USERS.moussa, A.id, 'subscriber', {
        at: '2026-09-02T09:00:00Z',
        type: 'payment.rejected',
      });
      const recent = await put(USERS.moussa, A.id, 'subscriber', { at: '2026-09-03T09:00:00Z' });
      expect((await list(f.tokens.moussa, '?unread=true')).items.map((n) => n.id)).toEqual([recent, mid]);
      expect((await list(f.tokens.moussa, '?type=payment.rejected')).items.map((n) => n.id)).toEqual([mid]);
      const first = await list(f.tokens.moussa, '?limit=2');
      expect(first.items.map((n) => n.id)).toEqual([recent, mid]);
      expect(first.total).toBe(3);
      const second = await list(f.tokens.moussa, `?limit=2&cursor=${first.nextCursor ?? ''}`);
      expect(second.items.map((n) => n.id)).toEqual([old]);
      expect(second.nextCursor).toBeNull();
    });

    it('curseur illisible ou tri inconnu : 422 validation_failed', async () => {
      const bad = await f.call('/me/notifications?cursor=nope', { token: f.tokens.moussa });
      expect(bad.status).toBe(422);
      expect(await codeOf(bad)).toBe('validation_failed');
      expect((await f.call('/me/notifications?sort=title', { token: f.tokens.moussa })).status).toBe(422);
    });

    it('sans jeton : 401', async () => {
      expect((await f.call('/me/notifications')).status).toBe(401);
    });
  });

  describe('compteur et lecture', () => {
    it('compteur cohérent après lecture : en cache, invalidé par nt.read (une, toutes)', async () => {
      const a = await put(USERS.moussa, A.id, 'subscriber');
      await put(USERS.moussa, A.id, 'subscriber');
      await put(USERS.moussa, A.id, 'subscriber', { read: true });
      expect(await unread(f.tokens.moussa)).toBe(2);
      // En cache : une ligne écrite hors api et hors consommateur n'est pas encore comptée.
      await put(USERS.moussa, A.id, 'subscriber');
      expect(await unread(f.tokens.moussa)).toBe(2);

      const res = await read(f.tokens.moussa, a);
      expect(res.status).toBe(200);
      expect(One.parse(await res.json()).readAt).not.toBeNull();
      // Invalidé par la lecture : recompté en base (3 non lues - 1).
      expect(await unread(f.tokens.moussa)).toBe(2);

      const all = await readAll(f.tokens.moussa);
      expect(all.status).toBe(200);
      expect(await all.json()).toEqual({ updated: 2 });
      expect(await unread(f.tokens.moussa)).toBe(0);
    });

    it('relire une notification déjà lue : read_at inchangé ; seul read_at change', async () => {
      const id = await put(USERS.moussa, A.id, 'subscriber');
      const before = (await list(f.tokens.moussa)).items[0];
      const first = One.parse(await (await read(f.tokens.moussa, id)).json());
      const again = One.parse(await (await read(f.tokens.moussa, id)).json());
      expect(again.readAt).toBe(first.readAt);
      expect({ ...again, readAt: null }).toEqual({ ...before, readAt: null });
    });

    it('notification d’une autre personne ou d’un autre espace : 404, rien ne change', async () => {
      const theirs = await put(USERS.fatou, B.id, 'subscriber');
      const res = await read(f.tokens.moussa, theirs);
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
      // Awa : sa notification de souscriptrice n'est pas lisible depuis l'espace association.
      const own = await put(USERS.awa, B.id, 'subscriber');
      expect((await read(f.tokens.awa, own)).status).toBe(404);
      const { rows } = await f.h.superuser('SELECT count(*)::int AS n FROM notifications WHERE read_at IS NOT NULL');
      expect(rows).toEqual([{ n: 0 }]);
    });

    it('compteurs en cache distincts par espace ; une lecture les invalide tous', async () => {
      await put(USERS.awa, A.id, 'manager');
      const m2 = await put(USERS.awa, A.id, 'manager');
      await put(USERS.awa, B.id, 'subscriber');
      expect(await unread(f.tokens.awa)).toBe(2);
      expect(await unread(awaSubscriber)).toBe(1);
      // Les deux sont en cache : chacun garde sa valeur.
      expect(await unread(f.tokens.awa)).toBe(2);
      expect(await unread(awaSubscriber)).toBe(1);
      await put(USERS.awa, B.id, 'subscriber');
      expect((await read(f.tokens.awa, m2)).status).toBe(200);
      expect(await unread(f.tokens.awa)).toBe(1);
      expect(await unread(awaSubscriber)).toBe(2);
    });

    it('read-all ne touche que l’espace courant', async () => {
      await put(USERS.awa, A.id, 'manager');
      const other = await put(USERS.awa, B.id, 'subscriber');
      expect(await (await readAll(f.tokens.awa)).json()).toEqual({ updated: 1 });
      const { rows } = await f.h.superuser('SELECT read_at FROM notifications WHERE id = $1', [other]);
      expect(rows).toEqual([{ read_at: null }]);
    });
  });
});
