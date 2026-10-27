import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf, STAFF } from './platform-associations.fixture.js';
import { type MembersFixture, PROJECTS, startMembersFixture } from './members.fixture.js';

/**
 * Lot 2.3 · étape 7 : pf.asso.sub, projets et membres d'une association lus par la plateforme (connexion
 * cotiz_platform), lecture auditée (ADR 0017). Membres : personnes inscrites à au moins un projet de l'association
 * (comme mb.list), nombre de projets suivis (hors retraits), situation la plus grave calculée par @cotiz/domain.
 *
 * Horloge figée au 2026-11-08 10:00 UTC (jeu du module members : 25 000 F le 5 de chaque mois depuis le 2026-03-01).
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Created = ENDPOINTS['en.create'].operations.create.response.body;
const Projects = ENDPOINTS['pf.asso.sub'].operations.projects.response.body;
const Members = ENDPOINTS['pf.asso.sub'].operations.members.response.body;
const NEW = { kofi: '+2250711223344', ama: '+2250722334455', yao: '+2250733445566' } as const;

describe('projets et membres d’une association (pf.asso.sub)', () => {
  let f: MembersFixture;
  let support: string;

  const enroll = async (body: unknown, options: { aid?: string; pid?: string; token?: string } = {}) => {
    const res = await f.call(`/associations/${options.aid ?? A.id}/projects/${options.pid ?? PROJECTS.a}/enrollments`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body,
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(res.status).toBe(201);
    return Created.parse(await res.json()).enrollment;
  };
  const get = (path: string, token: string | null = support) =>
    f.call(`/platform/associations/${path}`, token === null ? {} : { token });
  const projects = async (aid: string, query = '') => {
    const res = await get(`${aid}/projects${query}`);
    expect(res.status).toBe(200);
    return Projects.parse(await res.json());
  };
  const members = async (aid: string, query = '') => {
    const res = await get(`${aid}/members${query}`);
    expect(res.status).toBe(200);
    return Members.parse(await res.json());
  };
  let since: Date;
  const audits = async () =>
    (
      await f.h.superuser(
        `SELECT action, actor_user_id, association_id, entity_type, entity_id FROM audit_logs
          WHERE action LIKE 'association.view_%' AND occurred_at >= $1 ORDER BY id`,
        [since],
      )
    ).rows as Record<string, unknown>[];

  /** Kofi en retard sur A et inscrit à A2, Moussa à jour, Ama retirée ; Yao inscrit chez B. */
  const scenario = async () => {
    const kofi = await enroll({ phone: NEW.kofi, firstName: 'Kofi', lastName: 'Annan', startsFrom: '2026-03-01' });
    await enroll({ userId: kofi.member.id }, { pid: PROJECTS.a2 });
    const moussa = await enroll({ userId: USERS.moussa, startsFrom: '2026-11-01' });
    await f.h.superuser(
      `UPDATE installments SET amount_paid = amount_due WHERE enrollment_id = $1 AND due_date = '2026-11-05'`,
      [moussa.id],
    );
    const ama = await enroll({ phone: NEW.ama, firstName: 'Ama', lastName: 'Kouassi' });
    const withdrawn = await f.call(`/associations/${A.id}/enrollments/${ama.id}/withdraw`, {
      token: f.tokens.awa,
      method: 'POST',
      body: {},
    });
    expect(withdrawn.status).toBe(200);
    const yao = await enroll(
      { phone: NEW.yao, firstName: 'Yao', lastName: 'Bé' },
      { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
    );
    return { kofi: kofi.member.id, ama: ama.member.id, yao: yao.member.id };
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startMembersFixture();
    support = await f.login('platform', STAFF.support.email);
  });

  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.setSystemTime(NOW);
    await f.resetMembers();
    since = ((await f.h.superuser('SELECT clock_timestamp() AS t')).rows as [{ t: Date }])[0].t;
  });

  it('projets de l’association : inscrits en cours (hors retraits) et montant versé ; lecture auditée', async () => {
    await scenario();
    const page = await projects(A.id);
    const byId = new Map(page.items.map((p) => [p.id, p]));
    expect(page.total).toBe(page.items.length);
    expect(byId.get(PROJECTS.a)).toMatchObject({
      name: 'Centre communautaire',
      status: 'enrolling',
      subscribersCount: 2,
      collected: { amount: 25_000, currency: 'XOF' },
    });
    expect(byId.get(PROJECTS.a2)).toMatchObject({ subscribersCount: 1, collected: { amount: 0, currency: 'XOF' } });
    expect(byId.get(PROJECTS.draftA)).toMatchObject({ status: 'draft', subscribersCount: 0 });
    expect(byId.has(PROJECTS.b)).toBe(false);
    expect((await projects(B.id)).items.map((p) => p.id)).toContain(PROJECTS.b);
    expect(await audits()).toEqual([
      expect.objectContaining({
        action: 'association.view_projects',
        actor_user_id: STAFF.support.id,
        association_id: A.id,
        entity_type: 'association',
        entity_id: A.id,
      }),
      expect.objectContaining({ action: 'association.view_projects', entity_id: B.id, association_id: B.id }),
    ]);
  });

  it('pages de projets par curseur, les plus récents d’abord', async () => {
    const all = await projects(A.id);
    const one = await projects(A.id, '?limit=2');
    const two = await projects(A.id, `?limit=2&cursor=${one.nextCursor ?? ''}`);
    expect(one.items).toHaveLength(2);
    expect([...one.items, ...two.items].map((p) => p.id)).toEqual(all.items.slice(0, 4).map((p) => p.id));
    expect((await get(`${A.id}/projects?cursor=illisible`)).status).toBe(422);
  });

  it('membres : inscrits de l’association seulement, projets suivis, situation la plus grave, recherche', async () => {
    const { kofi, ama, yao } = await scenario();
    const page = await members(A.id);
    const byId = new Map(page.items.map((m) => [m.user.id, m]));
    expect(page.total).toBe(3);
    expect([...byId.keys()].sort()).toEqual([kofi, ama, USERS.moussa].sort());
    expect(byId.get(kofi)).toMatchObject({ projectsCount: 2, standing: 'late', user: { phone: NEW.kofi } });
    expect(byId.get(USERS.moussa)).toMatchObject({ projectsCount: 1, standing: 'up_to_date' });
    expect(byId.get(ama)).toMatchObject({ projectsCount: 0, standing: 'withdrawn' });
    expect((await members(A.id, '?q=kouassi')).items.map((m) => m.user.id)).toEqual([ama]);
    // Inscrit chez B seulement : jamais remonté par une recherche sur A.
    expect((await members(A.id, '?q=yao')).items).toEqual([]);
    expect((await members(B.id)).items.map((m) => m.user.id)).toEqual([yao]);
    expect(await audits()).toEqual([
      expect.objectContaining({ action: 'association.view_members', entity_id: A.id, association_id: A.id }),
      expect.objectContaining({ action: 'association.view_members', entity_id: A.id }),
      expect.objectContaining({ action: 'association.view_members', entity_id: A.id }),
      expect.objectContaining({ action: 'association.view_members', entity_id: B.id }),
    ]);
  });

  it('association inconnue : 404 ; hors de l’espace plateforme : 404 ; sans jeton : 401', async () => {
    for (const path of ['projects', 'members']) {
      const res = await get(`00000000-0000-7000-8000-0000000000ff/${path}`);
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
      expect((await get(`${A.id}/${path}`, f.tokens.awa)).status).toBe(404);
      expect((await get(`${A.id}/${path}`, null)).status).toBe(401);
    }
  });
});
