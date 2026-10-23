import { IssuedResetCode, ResetRequestList, ResetToken } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, USERS } from '../isolation/harness.js';
import { codeOf, OWNERS, type PlatformFixture, STAFF, startPlatformFixture } from './platform-associations.fixture.js';

/**
 * Lot 1.4 · étape 5 : demandes « mot de passe oublié » des gestionnaires, traitées par le super-admin (pf.resets).
 * Vérification de l'étape : parcours demande d'un gestionnaire → code émis par le super-admin → nouveau mot de passe.
 * Liste : demandes de l'espace association traitées par la plateforme (association_id NULL) seulement ; ni celles des
 * souscripteurs (traitées par leur association), ni celles du personnel plateforme (script `reset-password`).
 */

const KOFFI = 'koffi@test.cotiz.app';
const NEW_PASSWORD = 'Fromager-Treichville-2027';

describe('réinitialisations des gestionnaires (pf.resets)', () => {
  let f: PlatformFixture;
  let owner: string;
  let support: string;

  const forgot = (space: string, identifier: string) =>
    f.call('/auth/password/forgot', { method: 'POST', body: { space, identifier } });
  const list = async (query = '', token = owner) => {
    const res = await f.call(`/platform/password-reset-requests${query}`, { token });
    expect(res.status).toBe(200);
    return ResetRequestList.parse(await res.json());
  };
  const issue = (id: string, token = owner) =>
    f.call(`/platform/password-reset-requests/${id}/issue-code`, { token, method: 'POST' });
  const dbNow = async () => ((await f.h.superuser(`SELECT clock_timestamp() AS t`)).rows as [{ t: Date }])[0].t;

  beforeAll(async () => {
    f = await startPlatformFixture();
    owner = await f.login('platform', STAFF.owner.email);
    support = await f.login('platform', STAFF.support.email);
  });

  afterAll(() => f.stop());

  beforeEach(async () => {
    await f.h.superuser('DELETE FROM password_reset_requests');
  });

  it('parcours : demande d’un gestionnaire → code émis par le super-admin → nouveau mot de passe', async () => {
    expect((await forgot('association', KOFFI)).status).toBe(202);
    const [request, ...others] = (await list()).items;
    expect(others).toEqual([]);
    expect(request).toMatchObject({
      space: 'association',
      status: 'pending',
      user: { id: USERS.koffi, firstName: 'Koffi', email: KOFFI },
      handledAt: null,
      handledBy: null,
    });
    if (!request) return;

    const since = await dbNow();
    const res = await issue(request.id);
    expect(res.status).toBe(200);
    const issued = IssuedResetCode.parse(await res.json());
    expect(issued.request).toMatchObject({
      id: request.id,
      status: 'code_issued',
      handledBy: { id: STAFF.owner.id, firstName: STAFF.owner.first },
    });
    expect(issued.request.handledAt).not.toBeNull();
    expect(issued.handoff.code).toMatch(/^\d{6}$/);
    expect(issued.handoff.recipient).toMatchObject({ id: USERS.koffi, email: KOFFI });
    expect(issued.handoff.message).toContain(issued.handoff.code);
    expect(issued.handoff.activationUrl).toBeNull();
    expect(issued.handoff.mailtoUrl).toMatch(/^mailto:koffi@test\.cotiz\.app\?/);

    const verified = await f.call('/auth/password/verify-code', {
      method: 'POST',
      body: { space: 'association', identifier: KOFFI, code: issued.handoff.code },
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
      body: { space: 'association', identifier: KOFFI, password: NEW_PASSWORD },
    });
    expect(login.status).toBe(200);
    expect((await list('?status=completed')).items.map((r) => r.id)).toEqual([request.id]);

    // Audit et événement : jamais le code.
    const audit = (
      await f.h.superuser(
        `SELECT actor_user_id, association_id, entity_type, entity_id, after FROM audit_logs
          WHERE action = 'password_reset.issue_code' AND occurred_at >= $1`,
        [since],
      )
    ).rows as Record<string, unknown>[];
    expect(audit).toEqual([
      expect.objectContaining({
        actor_user_id: STAFF.owner.id,
        association_id: null,
        entity_type: 'password_reset_request',
        entity_id: request.id,
      }),
    ]);
    const events = (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, payload FROM outbox_events
          WHERE event_type = 'password_reset.code_issued' AND occurred_at >= $1`,
        [since],
      )
    ).rows as Record<string, unknown>[];
    expect(events).toEqual([
      {
        association_id: null,
        actor_user_id: STAFF.owner.id,
        payload: { requestId: request.id, issuedBy: STAFF.owner.id },
      },
    ]);
    expect(JSON.stringify([audit, events])).not.toContain(issued.handoff.code);
  });

  it('une seule émission : la demande déjà traitée → 409 request_already_handled', async () => {
    await forgot('association', KOFFI);
    const [request] = (await list()).items;
    if (!request) throw new Error('demande attendue');
    expect((await issue(request.id)).status).toBe(200);
    const again = await issue(request.id);
    expect(again.status).toBe(409);
    expect(await codeOf(again)).toBe('request_already_handled');
  });

  it('périmètre : ni les demandes des souscripteurs, ni celles du personnel plateforme', async () => {
    await forgot('association', KOFFI);
    await forgot('subscriber', 'fatou@test.cotiz.app');
    await forgot('platform', STAFF.support.email);
    const { items, total } = await list();
    expect(total).toBe(1);
    expect(items.map((r) => r.user.id)).toEqual([USERS.koffi]);

    const hidden = (
      await f.h.superuser(`SELECT id FROM password_reset_requests WHERE user_id <> $1 ORDER BY created_at`, [
        USERS.koffi,
      ])
    ).rows as { id: string }[];
    expect(hidden.length).toBeGreaterThanOrEqual(2);
    for (const { id } of hidden) {
      const res = await issue(id);
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
    }
    expect((await issue('00000000-0000-7000-8000-0000000015ff')).status).toBe(404);
  });

  it('liste : plus anciennes d’abord, filtre par statut, compteurs par statut, pagination', async () => {
    await forgot('association', KOFFI);
    await forgot('association', OWNERS.yao.email);
    await forgot('association', 'awa@test.cotiz.app');
    const all = await list();
    expect(all.items.map((r) => r.user.id)).toEqual([USERS.koffi, OWNERS.yao.id, USERS.awa]);
    expect(all.facets).toEqual({
      status: { pending: 3, code_issued: 0, completed: 0, expired: 0, dismissed: 0 },
    });

    const first = all.items[0];
    if (!first) throw new Error('demande attendue');
    await issue(first.id);
    expect((await list('?status=pending')).items.map((r) => r.user.id)).toEqual([OWNERS.yao.id, USERS.awa]);
    expect((await list('?status=code_issued')).items.map((r) => r.id)).toEqual([first.id]);
    expect((await list('?status=pending')).facets?.status).toMatchObject({ pending: 2, code_issued: 1 });

    const page1 = await list('?limit=2');
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await list(`?limit=2&cursor=${encodeURIComponent(page1.nextCursor ?? '')}`);
    expect(page2.items.map((r) => r.user.id)).toEqual([USERS.awa]);
    expect(page2.nextCursor).toBeNull();
  });

  it('émettre invalide le code précédent de la personne et traite ses autres demandes en attente', async () => {
    await forgot('association', KOFFI);
    await forgot('association', KOFFI);
    const [older, newer] = (await list()).items;
    if (!older || !newer) throw new Error('deux demandes attendues');
    const first = IssuedResetCode.parse(await (await issue(older.id)).json());
    // L'autre demande de la même personne est traitée avec la première : rien à émettre de plus.
    expect(await codeOf(await issue(newer.id))).toBe('request_already_handled');
    expect((await list('?status=code_issued')).items.map((r) => r.id).sort()).toEqual([older.id, newer.id].sort());

    // Nouvelle demande, nouveau code : le premier ne vaut plus.
    await forgot('association', KOFFI);
    const [third] = (await list('?status=pending')).items;
    if (!third) throw new Error('troisième demande attendue');
    const second = IssuedResetCode.parse(await (await issue(third.id)).json());
    const verify = (code: string) =>
      f.call('/auth/password/verify-code', { method: 'POST', body: { space: 'association', identifier: KOFFI, code } });
    if (first.handoff.code !== second.handoff.code) {
      expect(await codeOf(await verify(first.handoff.code))).toBe('invalid_code');
    }
    expect((await verify(second.handoff.code)).status).toBe(200);
  });

  it('émissions simultanées pour la même personne : une seule réussit, l’autre 409 (jamais 500)', async () => {
    await forgot('association', KOFFI);
    await forgot('association', KOFFI);
    const ids = (await list()).items.map((r) => r.id);
    expect(ids).toHaveLength(2);
    for (let round = 0; round < 3; round++) {
      await f.h.superuser(
        `UPDATE password_reset_requests SET status = 'pending', handled_by = NULL, handled_at = NULL`,
      );
      const statuses = (await Promise.all([...ids, ...ids].map((id) => issue(id)))).map((r) => r.status).sort();
      expect(statuses).toEqual([200, 409, 409, 409]);
    }
  });

  it('personnel plateforme aussi gestionnaire d’une association : jamais traité ici (absent, émission 404)', async () => {
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       VALUES (gen_random_uuid(), $1, $2, 'manager', 'active', now())`,
      [A.id, STAFF.support.id],
    );
    try {
      expect((await forgot('association', STAFF.support.email)).status).toBe(202);
      const [row] = (
        await f.h.superuser(`SELECT id FROM password_reset_requests WHERE user_id = $1 AND space = 'association'`, [
          STAFF.support.id,
        ])
      ).rows as { id: string }[];
      if (!row) throw new Error('demande du support attendue');
      expect((await list()).total).toBe(0);
      expect((await list()).facets?.status).toMatchObject({ pending: 0 });
      const res = await issue(row.id);
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
    } finally {
      await f.h.superuser(`DELETE FROM memberships WHERE user_id = $1`, [STAFF.support.id]);
    }
  });

  it('gestionnaire retiré depuis sa demande : demande ignorée, aucun code (404)', async () => {
    await forgot('association', KOFFI);
    const [request] = (await list()).items;
    if (!request) throw new Error('demande attendue');
    await f.h.superuser(`UPDATE memberships SET status = 'removed' WHERE user_id = $1 AND role = 'owner'`, [
      USERS.koffi,
    ]);
    try {
      const since = await dbNow();
      const res = await issue(request.id);
      expect(res.status).toBe(404);
      expect((await list('?status=dismissed')).items.map((r) => r.id)).toEqual([request.id]);
      const codes = await f.h.superuser(
        `SELECT count(*)::int AS n FROM one_time_codes WHERE user_id = $1 AND created_at >= $2`,
        [USERS.koffi, since],
      );
      expect(codes.rows[0]).toEqual({ n: 0 });
    } finally {
      await f.h.superuser(`UPDATE memberships SET status = 'active' WHERE user_id = $1 AND role = 'owner'`, [
        USERS.koffi,
      ]);
    }
  });

  it('permissions : support 403, gestionnaire ou souscripteur 404, sans jeton 401', async () => {
    await forgot('association', KOFFI);
    const [request] = (await list()).items;
    if (!request) throw new Error('demande attendue');
    expect(await codeOf(await f.call('/platform/password-reset-requests', { token: support }))).toBe('forbidden');
    expect(await codeOf(await issue(request.id, support))).toBe('forbidden');
    const manager = await f.login('association', 'awa@test.cotiz.app');
    expect((await f.call('/platform/password-reset-requests', { token: manager })).status).toBe(404);
    expect((await issue(request.id, manager)).status).toBe(404);
    expect((await issue(request.id, await f.login('subscriber', 'fatou@test.cotiz.app'))).status).toBe(404);
    expect((await f.call('/platform/password-reset-requests')).status).toBe(401);
    expect((await list('?status=pending')).items.map((r) => r.id)).toEqual([request.id]);
  });
});
