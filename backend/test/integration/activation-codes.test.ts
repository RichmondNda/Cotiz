import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf, STAFF } from './platform-associations.fixture.js';
import { type MembersFixture, PROJECTS, startMembersFixture } from './members.fixture.js';

/**
 * Lot 2.3 · étape 4 : codes à remettre (mb.codes) et régénération (mb.resend). La liste montre les comptes non activés
 * avec le dernier code émis par l'association (Q6 : `state` live|expired|blocked, message prêt seulement s'il sert) ; un
 * code consommé n'est plus lisible ; régénérer invalide l'ancien. Seule l'association qui a créé le compte émet un code
 * (B1) : ailleurs, mb.resend répond 409 invalid_state.
 *
 * Horloge : Date figée (puis qui avance) au 2026-11-08 10:00 UTC dans ce processus qui sert aussi l'API ; la base garde
 * son heure réelle, d'où `dbNow()` pour filtrer audits et événements.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const HOUR = 3_600_000;
const PASSWORD = 'Lagune-Baobab-2026';
const Created = ENDPOINTS['en.create'].operations.create.response.body;
const Codes = ENDPOINTS['mb.codes'].operations.list.response.body;
const Entry = ENDPOINTS['mb.codes'].operations.markHanded.response.body;
const Resent = ENDPOINTS['mb.resend'].operations.regenerate.response.body;

const NEW = { kofi: '+2250711223344', ama: '+2250722334455', yao: '+2250733445566' } as const;

describe('codes à remettre (mb.codes, mb.resend)', () => {
  let f: MembersFixture;

  const enrollNew = async (
    phone: string,
    options: { aid?: string; pid?: string; token?: string; firstName?: string } = {},
  ) => {
    const res = await f.call(`/associations/${options.aid ?? A.id}/projects/${options.pid ?? PROJECTS.a}/enrollments`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body: { phone, firstName: options.firstName ?? 'Kofi', lastName: 'Annan' },
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(res.status).toBe(201);
    const body = Created.parse(await res.json());
    return { userId: body.enrollment.member.id, handoff: body.handoff };
  };
  const list = (query = '', options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/activation-codes${query}`, { token: options.token ?? f.tokens.awa });
  const listed = async (query = '', options: Parameters<typeof list>[1] = {}) => {
    const res = await list(query, options);
    expect(res.status).toBe(200);
    return Codes.parse(await res.json());
  };
  const markHanded = (codeId: string, options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/activation-codes/${codeId}/handed`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
    });
  const resend = (userId: string, options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/members/${userId}/activation-code`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
    });
  const resent = async (userId: string) => {
    const res = await resend(userId);
    expect(res.status).toBe(200);
    return Resent.parse(await res.json());
  };
  const activate = (phone: string, code: string) =>
    fetch(`${f.base}/auth/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: phone, code, space: 'subscriber', newPassword: PASSWORD }),
    });
  const dbNow = async () => ((await f.h.superuser('SELECT clock_timestamp() AS t')).rows as [{ t: Date }])[0].t;
  const codeRows = async (userId: string) =>
    (
      await f.h.superuser(
        `SELECT id, code_encrypted IS NOT NULL AS sealed, consumed_at IS NOT NULL AS consumed, handed_at
           FROM one_time_codes WHERE user_id = $1 AND purpose = 'activation' ORDER BY created_at`,
        [userId],
      )
    ).rows as { id: string; sealed: boolean; consumed: boolean; handed_at: Date | null }[];

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startMembersFixture();
  });

  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await f.resetMembers();
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
  });

  describe('liste', () => {
    it('compte non activé créé par l’association : dernier code en clair, message prêt, non remis', async () => {
      const { userId, handoff } = await enrollNew(NEW.kofi);
      const [code] = await codeRows(userId);
      const page = await listed();
      expect(page.total).toBe(1);
      expect(page.nextCursor).toBeNull();
      expect(page.items).toEqual([
        {
          id: code?.id,
          member: { id: userId, firstName: 'Kofi', lastName: 'Annan', phone: NEW.kofi, email: null },
          state: 'live',
          handoff,
          issuedAt: expect.any(String) as string,
          handedAt: null,
        },
      ]);
      expect(page.items[0]?.handoff?.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it('ni comptes actifs, ni comptes créés par une autre association, ni codes d’une autre association', async () => {
      const ours = await enrollNew(NEW.kofi);
      const theirs = await enrollNew(NEW.ama, { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi });
      // Le compte créé par B est aussi inscrit chez A : A n'a émis aucun code, il n'est pas dans sa liste.
      await f.call(`/associations/${A.id}/projects/${PROJECTS.a}/enrollments`, {
        token: f.tokens.awa,
        method: 'POST',
        body: { userId: theirs.userId },
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      expect((await listed()).items.map((e) => e.member.id)).toEqual([ours.userId]);
      expect((await listed('', { aid: B.id, token: f.tokens.koffi })).items.map((e) => e.member.id)).toEqual([
        theirs.userId,
      ]);
    });

    it('souscripteur retiré de l’association : plus listé, son code ne se marque plus « remis »', async () => {
      const { userId } = await enrollNew(NEW.kofi);
      const [code] = await codeRows(userId);
      await f.h.superuser(
        `UPDATE memberships SET status = 'removed', removed_at = now()
          WHERE association_id = $1 AND user_id = $2 AND role = 'subscriber'`,
        [A.id, userId],
      );
      const page = await listed();
      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
      expect((await markHanded(code?.id ?? '')).status).toBe(404);
    });

    it('réponses avec codes en clair jamais en cache (no-store)', async () => {
      const { userId } = await enrollNew(NEW.kofi);
      const [code] = await codeRows(userId);
      for (const res of [await list(), await markHanded(code?.id ?? ''), await resend(userId)]) {
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
      }
    });

    it('lecteur (viewer) : 403', async () => {
      await enrollNew(NEW.kofi);
      const res = await list('', { token: f.tokens.koffi });
      expect(res.status).toBe(403);
    });

    it('code expiré : state expired, plus de message prêt', async () => {
      const { userId } = await enrollNew(NEW.kofi);
      // Échéance passée posée en base : avancer l'horloge de 72 h expirerait aussi le jeton de session.
      await f.h.superuser(`UPDATE one_time_codes SET expires_at = $2 WHERE user_id = $1`, [userId, new Date()]);
      expect((await listed()).items).toMatchObject([{ state: 'expired', handoff: null }]);
    });

    it('code bloqué par ses 5 essais : state blocked, plus de message prêt', async () => {
      const { userId } = await enrollNew(NEW.kofi);
      await f.h.superuser(`UPDATE one_time_codes SET attempts = 5 WHERE user_id = $1`, [userId]);
      expect((await listed()).items).toMatchObject([{ state: 'blocked', handoff: null }]);
    });

    it('pages par curseur (les plus récents d’abord), filtre « remis »', async () => {
      const first = await enrollNew(NEW.kofi);
      const second = await enrollNew(NEW.ama, { firstName: 'Ama' });
      const third = await enrollNew(NEW.yao, { firstName: 'Yao' });
      const one = await listed('?limit=2');
      expect(one.total).toBe(3);
      expect(one.items.map((e) => e.member.id)).toEqual([third.userId, second.userId]);
      expect(one.nextCursor).not.toBeNull();
      const two = await listed(`?limit=2&cursor=${one.nextCursor ?? ''}`);
      expect(two.items.map((e) => e.member.id)).toEqual([first.userId]);
      expect(two.nextCursor).toBeNull();

      expect((await markHanded(two.items[0]?.id ?? '')).status).toBe(200);
      const handed = await listed('?handed=true');
      expect(handed.items.map((e) => e.member.id)).toEqual([first.userId]);
      expect(handed.total).toBe(1);
      expect((await listed('?handed=false')).items.map((e) => e.member.id)).toEqual([third.userId, second.userId]);
    });

    it('curseur illisible : 422 validation_failed', async () => {
      const res = await list('?cursor=nimporte');
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe('validation_failed');
    });

    it('lecture auditée, sans code en clair', async () => {
      const since = await dbNow();
      const { handoff } = await enrollNew(NEW.kofi);
      await listed();
      const audit = await f.h.superuser(
        `SELECT actor_user_id, association_id, entity_type, after FROM audit_logs
          WHERE action = 'activation_code.list' AND occurred_at >= $1`,
        [since],
      );
      expect(audit.rows).toMatchObject([
        { actor_user_id: USERS.awa, association_id: A.id, entity_type: 'activation_code' },
      ]);
      expect(JSON.stringify(audit.rows)).not.toContain(handoff?.code ?? 'code attendu');
    });
  });

  describe('code consommé', () => {
    it('après activation : plus listé, plus lisible, ne se marque plus « remis »', async () => {
      const { userId, handoff } = await enrollNew(NEW.kofi);
      const [code] = await codeRows(userId);
      expect((await activate(NEW.kofi, handoff?.code ?? '')).status).toBe(200);

      expect((await listed()).items).toEqual([]);
      expect(await codeRows(userId)).toMatchObject([{ id: code?.id, consumed: true, sealed: false }]);
      const res = await markHanded(code?.id ?? '');
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
    });

    it('régénérer pour un compte activé : 409 already_activated, aucun code émis', async () => {
      const { userId, handoff } = await enrollNew(NEW.kofi);
      expect((await activate(NEW.kofi, handoff?.code ?? '')).status).toBe(200);
      const res = await resend(userId);
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('already_activated');
      expect(await codeRows(userId)).toHaveLength(1);
    });
  });

  describe('régénération (mb.resend)', () => {
    it('nouveau code et message prêt ; l’ancien est invalidé (activation refusée, hors liste)', async () => {
      const { userId, handoff: old } = await enrollNew(NEW.kofi);
      const [oldCode] = await codeRows(userId);
      const fresh = await resent(userId);
      expect(fresh.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(fresh.code).not.toBe(old?.code);
      expect(fresh.recipient).toEqual({
        id: userId,
        firstName: 'Kofi',
        lastName: 'Annan',
        phone: NEW.kofi,
        email: null,
      });
      const ttl = new Date(fresh.expiresAt).getTime() - NOW.getTime();
      expect(ttl).toBeGreaterThanOrEqual(72 * HOUR);
      expect(ttl).toBeLessThan(72 * HOUR + 60_000);

      const rows = await codeRows(userId);
      expect(rows).toMatchObject([{ id: oldCode?.id, sealed: false }, { sealed: true }]);
      const page = await listed();
      expect(page.items).toMatchObject([{ id: rows[1]?.id, state: 'live', handoff: { code: fresh.code } }]);
      expect((await markHanded(oldCode?.id ?? '')).status).toBe(404);

      // Comparé au dernier code émis (CodeService) : l'ancien n'est plus qu'un code faux.
      const refused = await activate(NEW.kofi, old?.code ?? '');
      expect(refused.status).toBe(422);
      expect(await codeOf(refused)).toBe('invalid_code');
      expect((await activate(NEW.kofi, fresh.code)).status).toBe(200);
    });

    it('code expiré ou bloqué : régénérer redonne un code vivant', async () => {
      const { userId } = await enrollNew(NEW.kofi);
      await f.h.superuser(`UPDATE one_time_codes SET attempts = 5 WHERE user_id = $1`, [userId]);
      const fresh = await resent(userId);
      expect((await listed()).items).toMatchObject([{ state: 'live', handoff: { code: fresh.code } }]);
    });

    it('événement activation.code_issued et audit, sans code ni téléphone en clair', async () => {
      const { userId } = await enrollNew(NEW.kofi);
      const since = await dbNow();
      const fresh = await resent(userId);
      const codeId = (await codeRows(userId))[1]?.id;
      const events = await f.h.superuser(
        `SELECT association_id, actor_user_id, payload FROM outbox_events
          WHERE event_type = 'activation.code_issued' AND occurred_at >= $1`,
        [since],
      );
      expect(events.rows).toEqual([
        { association_id: A.id, actor_user_id: USERS.awa, payload: { userId, associationId: A.id, codeId } },
      ]);
      const audit = await f.h.superuser(
        `SELECT actor_user_id, association_id, entity_type, entity_id, after FROM audit_logs
          WHERE action = 'activation_code.issue' AND occurred_at >= $1`,
        [since],
      );
      expect(audit.rows).toEqual([
        {
          actor_user_id: USERS.awa,
          association_id: A.id,
          entity_type: 'user',
          entity_id: userId,
          after: { activationCodeId: codeId },
        },
      ]);
      const text = JSON.stringify([events.rows, audit.rows]);
      expect(text).not.toContain(fresh.code);
      expect(text).not.toContain(NEW.kofi);
    });

    it('compte créé par une autre association : 409 invalid_state, le code d’origine reste valable', async () => {
      const { userId } = await enrollNew(NEW.kofi, { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi });
      await f.call(`/associations/${A.id}/projects/${PROJECTS.a}/enrollments`, {
        token: f.tokens.awa,
        method: 'POST',
        body: { userId },
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      const res = await resend(userId);
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('invalid_state');
      expect(await codeRows(userId)).toMatchObject([{ sealed: true }]);
    });

    it.each(['disabled', 'anonymized'])('compte %s : 409 invalid_state', async (status) => {
      const { userId } = await enrollNew(NEW.kofi);
      await f.h.superuser(`UPDATE users SET status = $1::users_status WHERE id = $2`, [status, userId]);
      const res = await resend(userId);
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('invalid_state');
      expect(await codeRows(userId)).toHaveLength(1);
    });

    it('membre du personnel de la plateforme, souscripteur non activé de A : 409 invalid_state', async () => {
      const { userId } = await enrollNew(NEW.kofi);
      await f.h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'support')`, [userId]);
      try {
        const res = await resend(userId);
        expect(res.status).toBe(409);
        expect(await codeOf(res)).toBe('invalid_state');
      } finally {
        await f.h.superuser('DELETE FROM platform_staff WHERE user_id = $1', [userId]);
      }
    });

    it('personne qui n’est pas souscriptrice de l’association : 404, comme un identifiant inconnu', async () => {
      const { userId } = await enrollNew(NEW.kofi, { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi });
      for (const uid of [userId, STAFF.owner.id, '00000000-0000-7000-8000-0000000000ff']) {
        const res = await resend(uid);
        expect(res.status).toBe(404);
        expect(await codeOf(res)).toBe('not_found');
      }
      expect(await codeRows(userId)).toHaveLength(1);
    });

    it('lecteur (viewer) : 403', async () => {
      const { userId } = await enrollNew(NEW.kofi);
      expect((await resend(userId, { token: f.tokens.koffi })).status).toBe(403);
    });
  });

  describe('marquer « remis »', () => {
    it('date et auteur posés une fois : activation.code_handed et audit au premier marquage seulement', async () => {
      const { userId } = await enrollNew(NEW.kofi);
      const [code] = await codeRows(userId);
      const since = await dbNow();
      const first = await markHanded(code?.id ?? '');
      expect(first.status).toBe(200);
      const entry = Entry.parse(await first.json());
      expect(entry).toMatchObject({ id: code?.id, state: 'live', handedAt: expect.any(String) as string });
      const again = Entry.parse(await (await markHanded(code?.id ?? '')).json());
      expect(again.handedAt).toBe(entry.handedAt);

      const events = await f.h.superuser(
        `SELECT association_id, payload FROM outbox_events
          WHERE event_type = 'activation.code_handed' AND occurred_at >= $1`,
        [since],
      );
      expect(events.rows).toEqual([{ association_id: A.id, payload: { codeId: code?.id, handedBy: USERS.awa } }]);
      const audit = await f.h.superuser(
        `SELECT entity_type, entity_id FROM audit_logs WHERE action = 'activation_code.hand' AND occurred_at >= $1`,
        [since],
      );
      expect(audit.rows).toEqual([
        { entity_type: 'activation_code', entity_id: code?.id },
        { entity_type: 'activation_code', entity_id: code?.id },
      ]);
    });

    it('code d’une autre association : 404, rien n’est écrit', async () => {
      const { userId } = await enrollNew(NEW.kofi, { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi });
      const [code] = await codeRows(userId);
      const res = await markHanded(code?.id ?? '');
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
      expect(await codeRows(userId)).toMatchObject([{ handed_at: null }]);
    });

    it('lecteur (viewer) : 403', async () => {
      const { userId } = await enrollNew(NEW.kofi);
      const [code] = await codeRows(userId);
      expect((await markHanded(code?.id ?? '', { token: f.tokens.koffi })).status).toBe(403);
    });
  });
});
