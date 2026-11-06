import { IssuedResetCode, ResetRequestList, ResetToken } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf, type PlatformFixture, STAFF, startPlatformFixture } from './platform-associations.fixture.js';

/**
 * Lot 3.1 · étape 3 : demandes « mot de passe oublié » des souscripteurs, traitées par leur association (as.resets).
 * Vérification de l'étape : parcours mot de passe oublié → code émis par Awa → nouveau mot de passe.
 * Jeu du harnais : A (Awa, owner ; Moussa et Aminata souscripteurs ; Fatou retirée), B (Koffi, owner ; Fatou et Awa
 * souscriptrices). Rôle le plus élevé (décision du 2026-11-06) : la demande de souscripteur d'une gestionnaire (Awa dans
 * B) ou du personnel plateforme n'est jamais traitée par une association.
 */

const email = (key: string) => `${key}@test.cotiz.app`;
const NEW_PASSWORD = 'Fromager-Yopougon-2027';

describe('réinitialisations des souscripteurs (as.resets)', () => {
  let f: PlatformFixture;
  let awa: string;
  let koffi: string;

  const forgot = (identifier: string, space = 'subscriber') =>
    f.call('/auth/password/forgot', { method: 'POST', body: { space, identifier } });
  const listRes = (aid: string, token: string, query = '') =>
    f.call(`/associations/${aid}/password-reset-requests${query}`, { token });
  const list = async (aid = A.id, token = awa, query = '') => {
    const res = await listRes(aid, token, query);
    expect(res.status).toBe(200);
    return ResetRequestList.parse(await res.json());
  };
  const issue = (id: string, aid = A.id, token = awa) =>
    f.call(`/associations/${aid}/password-reset-requests/${id}/issue-code`, { token, method: 'POST' });
  const dbNow = async () => ((await f.h.superuser(`SELECT clock_timestamp() AS t`)).rows as [{ t: Date }])[0].t;
  const requestsOf = async (userId: string) =>
    (
      await f.h.superuser(
        `SELECT id, association_id, space, status FROM password_reset_requests WHERE user_id = $1 ORDER BY created_at, id`,
        [userId],
      )
    ).rows as { id: string; association_id: string | null; space: string; status: string }[];
  /** Demande d'une version antérieure (avant la règle du rôle le plus élevé), écrite directement. */
  const legacyRequest = async (userId: string, associationId: string) => {
    const { rows } = await f.h.superuser(
      `INSERT INTO password_reset_requests (id, user_id, association_id, space)
       VALUES (gen_random_uuid(), $1, $2, 'subscriber') RETURNING id`,
      [userId, associationId],
    );
    return (rows as [{ id: string }])[0].id;
  };
  const codesSince = async (userId: string, since: Date) =>
    (
      (
        await f.h.superuser(`SELECT count(*)::int AS n FROM one_time_codes WHERE user_id = $1 AND created_at >= $2`, [
          userId,
          since,
        ])
      ).rows as [{ n: number }]
    )[0].n;

  beforeAll(async () => {
    f = await startPlatformFixture();
    awa = await f.login('association', email('awa'));
    koffi = await f.login('association', email('koffi'));
  });

  afterAll(() => f.stop());

  beforeEach(async () => {
    await f.h.superuser('DELETE FROM password_reset_requests');
  });

  it('parcours : mot de passe oublié → code émis par Awa → nouveau mot de passe', async () => {
    expect((await forgot(email('moussa'))).status).toBe(202);
    const { items, total } = await list();
    expect(total).toBe(1);
    const [request] = items;
    expect(request).toMatchObject({
      space: 'subscriber',
      status: 'pending',
      user: { id: USERS.moussa, firstName: 'Moussa', email: email('moussa'), phone: null },
      handledAt: null,
      handledBy: null,
    });
    if (!request) return;

    const since = await dbNow();
    const res = await issue(request.id);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const issued = IssuedResetCode.parse(await res.json());
    expect(issued.request).toMatchObject({
      id: request.id,
      status: 'code_issued',
      handledBy: { id: USERS.awa, firstName: 'Awa' },
    });
    expect(issued.handoff.code).toMatch(/^\d{6}$/);
    expect(issued.handoff.recipient).toMatchObject({ id: USERS.moussa });
    expect(issued.handoff.message).toContain(issued.handoff.code);
    expect(issued.handoff.activationUrl).toBeNull();

    const verified = await f.call('/auth/password/verify-code', {
      method: 'POST',
      body: { space: 'subscriber', identifier: email('moussa'), code: issued.handoff.code },
    });
    expect(verified.status).toBe(200);
    const { resetToken } = ResetToken.parse(await verified.json());
    const reset = await f.call('/auth/password/reset', {
      method: 'POST',
      body: { resetToken, newPassword: NEW_PASSWORD },
    });
    expect(reset.status).toBe(204);
    const login = await f.call('/auth/login', {
      method: 'POST',
      body: { space: 'subscriber', identifier: email('moussa'), password: NEW_PASSWORD },
    });
    expect(login.status).toBe(200);
    expect((await list(A.id, awa, '?status=completed')).items.map((r) => r.id)).toEqual([request.id]);

    // Audit et événement dans l'association A, jamais le code.
    const audit = (
      await f.h.superuser(
        `SELECT actor_user_id, association_id, entity_id FROM audit_logs
          WHERE action = 'password_reset.issue_code' AND occurred_at >= $1`,
        [since],
      )
    ).rows;
    expect(audit).toEqual([{ actor_user_id: USERS.awa, association_id: A.id, entity_id: request.id }]);
    const events = (
      await f.h.superuser(
        `SELECT association_id, payload FROM outbox_events
          WHERE event_type = 'password_reset.code_issued' AND occurred_at >= $1`,
        [since],
      )
    ).rows;
    expect(events).toEqual([{ association_id: A.id, payload: { requestId: request.id, issuedBy: USERS.awa } }]);
    const codes = (
      await f.h.superuser(
        `SELECT association_id, issued_by FROM one_time_codes WHERE user_id = $1 AND created_at >= $2`,
        [USERS.moussa, since],
      )
    ).rows;
    expect(codes).toEqual([{ association_id: A.id, issued_by: USERS.awa }]);
    expect(JSON.stringify([audit, events])).not.toContain(issued.handoff.code);
  });

  it('isolation : chaque association ne voit et ne traite que les demandes de ses souscripteurs (sinon 404)', async () => {
    await forgot(email('moussa'));
    await forgot(email('fatou'));
    const [ofA] = (await list(A.id, awa)).items;
    const [ofB] = (await list(B.id, koffi)).items;
    expect(ofA?.user.id).toBe(USERS.moussa);
    expect(ofB?.user.id).toBe(USERS.fatou);
    expect((await list(A.id, awa)).total).toBe(1);
    expect((await list(B.id, koffi)).total).toBe(1);
    if (!ofA || !ofB) return;

    // Demande d'une autre association, par l'URL de sa propre association : 404, rien n'est écrit.
    for (const [id, aid, token] of [
      [ofB.id, A.id, awa],
      [ofA.id, B.id, koffi],
    ] as const) {
      const res = await issue(id, aid, token);
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
    }
    // URL d'une association qu'on ne gère pas (Awa n'est que souscriptrice de B) : 404.
    expect((await listRes(B.id, awa)).status).toBe(404);
    expect((await issue(ofB.id, B.id, awa)).status).toBe(404);
    expect((await issue('00000000-0000-7000-8000-0000000015ff')).status).toBe(404);
    expect((await requestsOf(USERS.moussa)).map((r) => r.status)).toEqual(['pending']);
    expect((await requestsOf(USERS.fatou)).map((r) => r.status)).toEqual(['pending']);
  });

  it('une seule émission : 409 ensuite ; les autres demandes de la personne dans l’association sont traitées avec', async () => {
    await forgot(email('aminata'));
    await forgot(email('aminata'));
    const [older, newer] = (await list()).items;
    if (!older || !newer) throw new Error('deux demandes attendues');
    expect((await issue(older.id)).status).toBe(200);
    const again = await issue(older.id);
    expect(again.status).toBe(409);
    expect(await codeOf(again)).toBe('request_already_handled');
    expect(await codeOf(await issue(newer.id))).toBe('request_already_handled');
    expect((await list(A.id, awa, '?status=code_issued')).total).toBe(2);
  });

  it('liste : plus anciennes d’abord, filtre par statut, compteurs, pagination', async () => {
    await forgot(email('moussa'));
    await forgot(email('aminata'));
    const all = await list();
    expect(all.items.map((r) => r.user.id)).toEqual([USERS.moussa, USERS.aminata]);
    expect(all.facets).toEqual({ status: { pending: 2, code_issued: 0, completed: 0, expired: 0, dismissed: 0 } });
    const page1 = await list(A.id, awa, '?limit=1');
    expect(page1.items.map((r) => r.user.id)).toEqual([USERS.moussa]);
    const page2 = await list(A.id, awa, `?limit=1&cursor=${encodeURIComponent(page1.nextCursor ?? '')}`);
    expect(page2.items.map((r) => r.user.id)).toEqual([USERS.aminata]);
    expect(page2.nextCursor).toBeNull();
    expect((await list(A.id, awa, '?status=dismissed')).total).toBe(0);
  });

  it('rôle le plus élevé : la demande de souscripteur d’une gestionnaire va à la plateforme, jamais à son association', async () => {
    expect((await forgot(email('awa'))).status).toBe(202);
    expect(await requestsOf(USERS.awa)).toEqual([
      expect.objectContaining({ association_id: null, space: 'association', status: 'pending' }),
    ]);
    expect((await list(B.id, koffi)).total).toBe(0);
    const owner = await f.login('platform', STAFF.owner.email);
    const platform = ResetRequestList.parse(
      await (await f.call('/platform/password-reset-requests', { token: owner })).json(),
    );
    expect(platform.items.map((r) => r.user.id)).toEqual([USERS.awa]);
  });

  it('rôle le plus élevé, au moment du code : gestionnaire ou personnel plateforme → demande ignorée, aucun code, 404', async () => {
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       VALUES (gen_random_uuid(), $1, $2, 'subscriber', 'active', now())`,
      [B.id, STAFF.support.id],
    );
    try {
      // Le personnel plateforme : aucune demande pour son association (traitée par le script `reset-password`).
      await forgot(STAFF.support.email);
      expect((await requestsOf(STAFF.support.id)).map((r) => r.association_id)).toEqual([null]);
      expect((await list(B.id, koffi)).total).toBe(0);

      const since = await dbNow();
      for (const userId of [USERS.awa, STAFF.support.id]) {
        const id = await legacyRequest(userId, B.id);
        const res = await issue(id, B.id, koffi);
        expect(res.status).toBe(404);
        expect(await codeOf(res)).toBe('not_found');
        expect((await requestsOf(userId)).find((r) => r.id === id)?.status).toBe('dismissed');
        expect(await codesSince(userId, since)).toBe(0);
      }
    } finally {
      await f.h.superuser(`DELETE FROM memberships WHERE user_id = $1`, [STAFF.support.id]);
    }
  });

  it('code émis par l’association, puis la personne devient gestionnaire ailleurs : le code ne sert plus', async () => {
    await forgot(email('aminata'));
    const [request] = (await list()).items;
    if (!request) throw new Error('demande attendue');
    const issued = IssuedResetCode.parse(await (await issue(request.id)).json());
    const verified = await f.call('/auth/password/verify-code', {
      method: 'POST',
      body: { space: 'subscriber', identifier: email('aminata'), code: issued.handoff.code },
    });
    expect(verified.status).toBe(200);
    const { resetToken } = ResetToken.parse(await verified.json());
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       VALUES (gen_random_uuid(), $1, $2, 'manager', 'invited', NULL)`,
      [B.id, USERS.aminata],
    );
    try {
      const reset = await f.call('/auth/password/reset', {
        method: 'POST',
        body: { resetToken, newPassword: NEW_PASSWORD },
      });
      expect(await codeOf(reset)).toBe('reset_token_invalid');
      const login = await f.call('/auth/login', {
        method: 'POST',
        body: { space: 'subscriber', identifier: email('aminata'), password: NEW_PASSWORD },
      });
      expect(login.status).toBe(401);
    } finally {
      await f.h.superuser(`DELETE FROM memberships WHERE user_id = $1 AND association_id = $2`, [USERS.aminata, B.id]);
    }
  });

  it('compte désactivé depuis sa demande : ignorée (audit dans l’association), aucun code, 404', async () => {
    await forgot(email('moussa'));
    const [request] = (await list()).items;
    if (!request) throw new Error('demande attendue');
    await f.h.superuser(`UPDATE users SET status = 'disabled' WHERE id = $1`, [USERS.moussa]);
    try {
      const since = await dbNow();
      expect((await issue(request.id)).status).toBe(404);
      expect((await requestsOf(USERS.moussa)).map((r) => r.status)).toEqual(['dismissed']);
      expect(await codesSince(USERS.moussa, since)).toBe(0);
      const audit = await f.h.superuser(
        `SELECT association_id, after FROM audit_logs
          WHERE action = 'password_reset.issue_code' AND entity_id = $1 AND occurred_at >= $2`,
        [request.id, since],
      );
      expect(audit.rows).toEqual([{ association_id: A.id, after: { status: 'dismissed' } }]);
    } finally {
      await f.h.superuser(`UPDATE users SET status = 'active' WHERE id = $1`, [USERS.moussa]);
    }
  });

  it('souscripteur retiré de l’association depuis sa demande : demande ignorée, aucun code (404)', async () => {
    // Fatou a été retirée de A (jeu du harnais) : auth.forgot ne crée sa demande que dans B.
    await forgot(email('fatou'));
    expect((await requestsOf(USERS.fatou)).map((r) => r.association_id)).toEqual([B.id]);
    const since = await dbNow();
    const id = await legacyRequest(USERS.fatou, A.id);
    expect((await list()).items.map((r) => r.user.id)).toEqual([USERS.fatou]);
    expect((await issue(id)).status).toBe(404);
    expect((await list(A.id, awa, '?status=dismissed')).items.map((r) => r.id)).toEqual([id]);
    expect(await codesSince(USERS.fatou, since)).toBe(0);
    // La demande de B n'est pas touchée.
    expect((await list(B.id, koffi, '?status=pending')).total).toBe(1);
  });

  it('permissions : souscripteur 404, sans jeton 401', async () => {
    await forgot(email('moussa'));
    const [request] = (await list()).items;
    if (!request) throw new Error('demande attendue');
    const aminata = await f.login('subscriber', email('aminata'));
    expect((await listRes(A.id, aminata)).status).toBe(404);
    expect((await issue(request.id, A.id, aminata)).status).toBe(404);
    expect((await f.call(`/associations/${A.id}/password-reset-requests`)).status).toBe(401);
    expect((await list(A.id, awa, '?status=pending')).items.map((r) => r.id)).toEqual([request.id]);
  });
});
