import { ENDPOINTS, LoginResponse } from '@cotiz/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUDIT_EXPORT_MAX_ROWS } from '../../src/modules/audit/application/export-audit-logs.use-case.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { A, B, USERS } from '../isolation/harness.js';
import {
  codeOf,
  OWNERS,
  PASSWORD,
  type PlatformFixture,
  STAFF,
  startPlatformFixture,
} from './platform-associations.fixture.js';

/**
 * Lot 4.7 · étape 3 : journal d'audit de la plateforme (pf.audit, `platform.audit.read` : owner et admin) — liste
 * filtrée (acteur, action, association, période), export CSV des mêmes filtres — et export JSON de ses propres données
 * (me.profile › export). Vérification de l'étape : tests de permission.
 */

const AUDIT = ENDPOINTS['pf.audit'].operations;
const ME = ENDPOINTS['me.profile'].operations;
const ADMIN = { id: '00000000-0000-7000-8000-0000000047b1', email: 'admin-audit@cotiz.test' };

describe('journal d’audit (pf.audit) et export de ses données (me.profile › export)', () => {
  let f: PlatformFixture;
  let owner: string;
  let admin: string;

  const list = async (query = '', token = owner) => {
    const res = await f.call(`/platform/audit-logs${query}`, { token });
    expect(res.status).toBe(200);
    return AUDIT.list.response.body.parse(await res.json());
  };

  beforeAll(async () => {
    f = await startPlatformFixture();
    await f.h.superuser(
      `INSERT INTO users (id, email, first_name, last_name, status) VALUES ($1, $2, 'Ama', 'Admin', 'active')`,
      [ADMIN.id, ADMIN.email],
    );
    await f.h.superuser(`INSERT INTO credentials (user_id, password_hash) VALUES ($1, $2)`, [
      ADMIN.id,
      await new SecretHasher().hash(PASSWORD),
    ]);
    await f.h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'admin')`, [ADMIN.id]);
    // Une entrée dont les champs commencent comme une formule de tableur, et une adresse IP.
    await f.h.superuser(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_role, association_id, action, entity_type, entity_id, ip)
       VALUES ('2026-09-03T08:00:00Z', $1, '=platform:owner', $2, 'payment.validate', '=cmd', NULL, '10.0.0.7')`,
      [STAFF.owner.id, A.id],
    );
    // Bornes de la période `[from, to[` (filtres) et deux entrées à la même date (départage du curseur par id).
    await f.h.superuser(
      `INSERT INTO audit_logs (occurred_at, actor_role, action, entity_type)
       VALUES ('2026-09-01T12:00:00Z', 'system', 'test.bound_from', 'test'),
              ('2026-09-10T00:00:00Z', 'system', 'test.bound_to', 'test'),
              ('2026-08-15T10:00:00Z', 'system', 'test.tie', 'test'), ('2026-08-15T10:00:00Z', 'system', 'test.tie', 'test')`,
    );
    owner = await f.login('platform', STAFF.owner.email);
    admin = await f.login('platform', ADMIN.email);
  });

  afterAll(async () => {
    await f.stop();
  });

  it('owner et admin lisent ; support 403 ; gestionnaire 404 ; sans jeton 401', async () => {
    expect((await list('', admin)).items.length).toBeGreaterThan(0);
    const support = await f.login('platform', STAFF.support.email);
    const manager = await f.login('association', OWNERS.yao.email);
    for (const path of ['/platform/audit-logs', '/platform/audit-logs/export']) {
      const res = await f.call(path, { token: support });
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('forbidden');
      expect((await f.call(path, { token: manager })).status).toBe(404);
      expect((await f.call(path, {})).status).toBe(401);
    }
  });

  it('liste : les plus récentes d’abord, acteur nommé, pagination par curseur', async () => {
    const first = await list('?limit=2');
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const dates = first.items.map((e) => e.occurredAt);
    expect([...dates].sort().reverse()).toEqual(dates);
    const second = await list(`?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`);
    const firstIds = first.items.map((e) => e.id);
    expect(second.items.some((e) => firstIds.includes(e.id))).toBe(false);
    expect((second.items[0]?.occurredAt ?? '') <= (first.items[1]?.occurredAt ?? '')).toBe(true);
    const all = await list('?limit=100');
    expect(all.total).toBe(all.items.length);
    const created = all.items.find((e) => e.action === 'association.create' && e.associationId === A.id);
    expect(created).toMatchObject({
      actor: { id: STAFF.owner.id, firstName: STAFF.owner.first, lastName: STAFF.owner.last },
      actorRole: 'platform:owner',
      entityType: 'association',
      entityId: A.id,
    });
    expect((await f.call('/platform/audit-logs?cursor=abc', { token: owner })).status).toBe(422);
    // Même date : le curseur départage par id, rien de perdu ni de répété.
    const tie1 = await list('?action=test.tie&limit=1');
    const tie2 = await list(`?action=test.tie&limit=1&cursor=${encodeURIComponent(tie1.nextCursor ?? '')}`);
    expect(tie1.total).toBe(2);
    expect(new Set([...tie1.items, ...tie2.items].map((e) => e.id)).size).toBe(2);
    expect(tie2.nextCursor).toBeNull();
  });

  it('filtres : acteur, action (préfixe), association, période', async () => {
    const byAssociation = await list(`?associationId=${B.id}&limit=100`);
    expect(byAssociation.items.length).toBeGreaterThan(0);
    expect(byAssociation.items.every((e) => e.associationId === B.id)).toBe(true);

    const byAction = await list('?action=association.&limit=100');
    expect(byAction.items.length).toBeGreaterThanOrEqual(2);
    expect(byAction.items.every((e) => e.action.startsWith('association.'))).toBe(true);
    // Un joker n'en est pas un : « % » ne correspond à rien.
    expect((await list('?action=%25')).items).toEqual([]);

    const byActor = await list(`?actorUserId=${STAFF.owner.id}&limit=100`);
    expect(byActor.items.length).toBeGreaterThan(0);
    expect(byActor.items.every((e) => e.actor?.id === STAFF.owner.id)).toBe(true);
    expect((await list(`?actorUserId=${USERS.koffi}`)).items).toEqual([]);

    const period = await list('?from=2026-09-01T12:00:00Z&to=2026-09-10T00:00:00Z&limit=100');
    // `from` compris, `to` exclu.
    expect(period.items.map((e) => e.action).sort()).toEqual(['payment.validate', 'plan.update', 'test.bound_from']);
    expect(period.total).toBe(3);
  });

  it('export CSV : mêmes filtres, BOM et « ; », formules neutralisées, audité', async () => {
    const res = await f.call(`/platform/audit-logs/export?associationId=${A.id}`, { token: admin });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/csv/);
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="journal-audit-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(res.headers.get('x-truncated')).toBe('false');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8 (Excel)
    const lines = bytes.subarray(3).toString('utf8').trimEnd().split('\r\n');
    expect(lines[0]).toBe('"Date";"Acteur";"Rôle";"Association";"Action";"Entité";"Identifiant";"Adresse IP"');
    expect(lines.length - 1).toBe((await list(`?associationId=${A.id}&limit=100`)).total);
    const formula = lines.find((l) => l.includes('payment.validate'));
    expect(formula).toContain(`"'=platform:owner"`);
    expect(formula).toContain(`"'=cmd"`);
    expect(formula).toContain('"10.0.0.7"');
    // Acteur nommé, date en fr-FR à l'heure d'Abidjan (UTC).
    expect(formula).toContain(`"${STAFF.owner.first} ${STAFF.owner.last}"`);
    expect(formula?.startsWith('"03/09/2026 08:00:00"')).toBe(true);
    expect(lines.some((l) => l.includes(B.id))).toBe(false);
    const audited = await f.h.superuser(
      `SELECT actor_user_id, after FROM audit_logs WHERE action = 'audit_log.export' ORDER BY id DESC LIMIT 1`,
    );
    expect(audited.rows).toEqual([
      { actor_user_id: ADMIN.id, after: { filters: { associationId: A.id }, rows: lines.length - 1 } },
    ]);
  });

  it('export de ses données : la personne du jeton, sans secret, audité', async () => {
    for (const [space, identifier, id] of [
      ['platform', STAFF.owner.email, STAFF.owner.id],
      ['association', OWNERS.yao.email, OWNERS.yao.id],
    ] as const) {
      const token = await f.login(space, identifier);
      const res = await f.call('/me/export', { token });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = ME.export.response.body.parse(await res.json());
      expect(body.profile.id).toBe(id);
      expect(body.account.status).toBe('active');
      expect(body.sessions.length).toBeGreaterThan(0);
      const raw = JSON.stringify(body).toLowerCase();
      for (const secret of ['password_hash', 'hash"', 'secret', 'token', 'recovery']) {
        expect(raw).not.toContain(secret);
      }
      if (space === 'platform') {
        expect(body.platformRole).toBe('owner');
        expect(body.profile.mfaEnabled).toBe(true);
      } else {
        expect(body.platformRole).toBeNull();
        expect(body.memberships.map((m) => m.role)).toContain('owner');
      }
    }
    const audited = await f.h.superuser(
      `SELECT count(*)::int AS n FROM audit_logs
        WHERE action = 'user.export_data' AND entity_id = $1 AND actor_user_id = $1`,
      [OWNERS.yao.id],
    );
    expect(audited.rows).toEqual([{ n: 1 }]);
    expect((await f.call('/me/export', {})).status).toBe(401);
  });

  it('export CSV borné : 10 000 entrées au plus, `X-Truncated: true` au-delà', async () => {
    await f.h.superuser(
      `INSERT INTO audit_logs (occurred_at, actor_role, action, entity_type)
       SELECT '2026-07-01T00:00:00Z'::timestamptz + n * interval '1 second', 'system', 'bulk.row', 'test'
         FROM generate_series(1, $1::int) AS n`,
      [AUDIT_EXPORT_MAX_ROWS + 1],
    );
    const at = async (query: string) => {
      const res = await f.call(`/platform/audit-logs/export${query}`, { token: owner });
      expect(res.status).toBe(200);
      const lines = Buffer.from(await res.arrayBuffer())
        .subarray(3)
        .toString('utf8')
        .trimEnd()
        .split('\r\n');
      return { truncated: res.headers.get('x-truncated'), rows: lines.length - 1, lines };
    };
    const over = await at('?action=bulk.');
    expect(over).toMatchObject({ truncated: 'true', rows: AUDIT_EXPORT_MAX_ROWS });
    // Les plus récentes : la toute première (n = 1) est celle laissée de côté.
    expect(over.lines.some((l) => l.startsWith('"01/07/2026 00:00:01"'))).toBe(false);
    // Exactement la limite : pas de troncature.
    expect(await at('?action=bulk.&from=2026-07-01T00:00:02Z')).toMatchObject({
      truncated: 'false',
      rows: AUDIT_EXPORT_MAX_ROWS,
    });
  });

  it('session restreinte à l’enrôlement du second facteur : aucun export', async () => {
    await f.h.superuser(`DELETE FROM mfa_factors WHERE user_id = $1`, [STAFF.support.id]);
    const res = await f.call('/auth/login', {
      method: 'POST',
      body: { space: 'platform', identifier: STAFF.support.email, password: PASSWORD },
    });
    const body = LoginResponse.parse(await res.json());
    if (body.status !== 'authenticated') throw new Error('attendu : session restreinte');
    expect((await f.call('/me/export', { token: body.accessToken })).status).toBe(403);
  });
});
