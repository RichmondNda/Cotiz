import { ENDPOINTS } from '@cotiz/contracts';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ProjectsFixture, startProjectsFixture } from '../integration/projects.fixture.js';
import { A, asManagerOf, B, USERS } from './harness.js';

/**
 * Isolation HTTP de l'équipe (tm.team, lot 4.5) : par l'espace de B, son owner (Koffi) ne voit que l'équipe de B, et
 * ne change le rôle ni ne retire un gestionnaire de A (404, comme une personne inconnue) ; une invitation dans B d'une
 * gestionnaire de A ne touche pas son appartenance à A. Politique `memberships` élargie : la base laisse passer, le
 * code filtre encore. Jeu : A gérée par Awa (owner), Aminata (manager), Koffi (viewer) ; B par Koffi (owner).
 */

const TEAM = ENDPOINTS['tm.team'].operations;

describe('isolation HTTP : équipe', () => {
  let f: ProjectsFixture;

  const teamOfA = async () =>
    (
      await f.h.superuser(
        `SELECT user_id, role, status FROM memberships
          WHERE association_id = $1 AND role <> 'subscriber' ORDER BY user_id`,
        [A.id],
      )
    ).rows as { user_id: string; role: string; status: string }[];

  /** Ce que Koffi obtient de l'espace de B : rien qui vienne de A, et A inchangée. */
  const fromB = async () => {
    const before = await teamOfA();
    const koffi = f.tokens.koffi;
    const res = await f.call(`/associations/${B.id}/team`, { token: koffi });
    expect(res.status).toBe(200);
    const team = TEAM.list.response.body.parse(await res.json());
    expect(team.items.map((m) => m.member.id)).toEqual([USERS.koffi]);
    expect(team.seats.used).toBe(1);
    for (const uid of [USERS.awa, USERS.aminata]) {
      const patched = await f.call(`/associations/${B.id}/team/${uid}`, {
        token: koffi,
        method: 'PATCH',
        body: { role: 'viewer' },
      });
      expect(patched.status).toBe(404);
      expect((await f.call(`/associations/${B.id}/team/${uid}`, { token: koffi, method: 'DELETE' })).status).toBe(404);
    }
    expect(await teamOfA()).toEqual(before);
  };

  beforeAll(async () => {
    f = await startProjectsFixture();
  });

  afterAll(async () => {
    await f.stop();
  });

  beforeEach(async () => {
    await f.h.superuser(
      `DELETE FROM memberships WHERE association_id = $1 AND role <> 'subscriber' AND user_id <> $2`,
      [B.id, USERS.koffi],
    );
  });

  it('par l’espace de B : équipe de B seule, gestionnaires de A introuvables', async () => {
    await fromB();
  });

  it('A non gérée par l’owner (lecteur) : équipe de A refusée (403), invitation refusée', async () => {
    expect((await f.call(`/associations/${A.id}/team`, { token: f.tokens.koffi })).status).toBe(403);
    const invite = await f.call(`/associations/${A.id}/team/invitations`, {
      token: f.tokens.koffi,
      method: 'POST',
      body: { firstName: 'X', lastName: 'Y', email: 'x@test.cotiz.app', role: 'manager' },
    });
    expect(invite.status).toBe(403);
  });

  it('invitation dans B d’une gestionnaire de A : son appartenance à A ne change pas', async () => {
    const before = await teamOfA();
    const res = await f.call(`/associations/${B.id}/team/invitations`, {
      token: f.tokens.koffi,
      method: 'POST',
      body: { firstName: 'Aminata', lastName: 'Touré', email: 'aminata@test.cotiz.app', role: 'viewer' },
    });
    expect(res.status).toBe(201);
    expect(await teamOfA()).toEqual(before);
    const removed = await f.call(`/associations/${B.id}/team/${USERS.aminata}`, {
      token: f.tokens.koffi,
      method: 'DELETE',
    });
    expect(removed.status).toBe(204);
    expect(await teamOfA()).toEqual(before);
  });

  it('politique memberships élargie : la base montre A à B, l’API ne renvoie ni ne modifie rien de A', async () => {
    await f.h.withPolicy('memberships', 'tenant_isolation', { using: 'true', withCheck: 'true' }, async () => {
      const visible = await f.h.as(asManagerOf(B), (tx) =>
        tx
          .execute<{ user_id: string }>(sql`SELECT user_id FROM memberships WHERE association_id = ${A.id}`)
          .then((r) => r.rows.map((row) => row.user_id)),
      );
      expect(visible).toContain(USERS.aminata);
      await fromB();
    });
  });
});
