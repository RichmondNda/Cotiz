import { Project } from '@cotiz/contracts';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf, PLANS } from './platform-associations.fixture.js';
import { FIXED, METHODS, ROLLING, type ProjectsFixture, startProjectsFixture } from './projects.fixture.js';

/**
 * Lot 2.2 · étape 4 : cycle de vie d'un projet. pr.lifecycle : publication (draft → enrolling, project.published),
 * clôture (enrolling | active → completed, closedAt, project.closed), duplication (copie en brouillon, sans
 * couverture ni inscriptions, quota du plan : Q6) ; pr.delete : brouillon seulement (Q4), sous If-Match. Chaque
 * action est auditée. Vérification de l'étape : transitions interdites → 409 invalid_state.
 */

type Status = 'draft' | 'enrolling' | 'active' | 'completed' | 'archived';
const STATUSES: Status[] = ['draft', 'enrolling', 'active', 'completed', 'archived'];

describe('cycle de vie d’un projet (pr.lifecycle, pr.delete)', () => {
  let f: ProjectsFixture;

  const action = (pid: string, verb: 'publish' | 'close' | 'duplicate', token = f.tokens.awa, aid = A.id) =>
    f.call(`/associations/${aid}/projects/${pid}/${verb}`, { token, method: 'POST' });
  const remove = (pid: string, options: { version?: number | null; token?: string; aid?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/projects/${pid}`, {
      token: options.token ?? f.tokens.awa,
      method: 'DELETE',
      headers: options.version === null ? {} : { 'if-match': `W/"${String(options.version ?? 1)}"` },
    });
  const setStatus = (pid: string, status: Status) =>
    f.h.superuser('UPDATE projects SET status = $2 WHERE id = $1', [pid, status]);
  const row = async (pid: string) =>
    (await f.h.superuser('SELECT status, version, closed_at FROM projects WHERE id = $1', [pid])).rows[0] as
      { status: Status; version: number; closed_at: Date | null } | undefined;
  const events = async (type: string) =>
    (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, aggregate_id, payload FROM outbox_events WHERE event_type = $1 ORDER BY id`,
        [type],
      )
    ).rows as Record<string, unknown>[];
  const audits = async (actionName: string, pid: string) =>
    (
      await f.h.superuser(
        `SELECT actor_user_id, association_id, before, after FROM audit_logs WHERE action = $1 AND entity_id = $2`,
        [actionName, pid],
      )
    ).rows as { before: Record<string, unknown> | null; after: Record<string, unknown> | null }[];
  const cover = async () => {
    const id = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                          size_bytes, scan_status, sha256)
       VALUES ($1, $2, $3, 'cover', 'cotiz-media', $4, 'c.png', 'image/png', 10, 'clean', repeat('c', 64))`,
      [id, A.id, USERS.awa, `projects/${id}`],
    );
    return id;
  };

  beforeAll(async () => {
    f = await startProjectsFixture();
  });

  afterAll(() => f.stop());

  beforeEach(async () => {
    await f.reset();
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type LIKE 'project.%'`);
    await f.h.superuser('UPDATE plans SET max_projects = 5 WHERE id = $1', [PLANS.essentiel]);
  });

  describe('publication', () => {
    it('brouillon → inscriptions ouvertes ; version suivante ; project.published ; audit', async () => {
      const project = await f.created(FIXED);
      const res = await action(project.id, 'publish');
      expect(res.status).toBe(200);
      const published = Project.parse(await res.json());
      // Indicateurs calculés comme pr.get (ProjectFigures) : inscriptions ouvertes, 0 souscripteur sur 60 requis.
      expect(published).toEqual({
        ...project,
        status: 'enrolling',
        version: 2,
        stats: { ...project.stats, progress: 0 },
      });
      expect(await row(project.id)).toMatchObject({ status: 'enrolling', version: 2 });
      expect(await events('project.published')).toEqual([
        {
          association_id: A.id,
          actor_user_id: USERS.awa,
          aggregate_id: project.id,
          payload: { projectId: project.id },
        },
      ]);
      expect(await audits('project.publish', project.id)).toEqual([
        { actor_user_id: USERS.awa, association_id: A.id, before: { status: 'draft' }, after: { status: 'enrolling' } },
      ]);
    });

    it.each(STATUSES.filter((s) => s !== 'draft'))('%s : 409 invalid_state, rien n’est écrit', async (status) => {
      const project = await f.created(ROLLING);
      await setStatus(project.id, status);
      const res = await action(project.id, 'publish');
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('invalid_state');
      expect(await row(project.id)).toMatchObject({ status, version: 1 });
      expect(await events('project.published')).toEqual([]);
      expect(await audits('project.publish', project.id)).toEqual([]);
    });
  });

  describe('clôture', () => {
    it.each(['enrolling', 'active'] as const)(
      '%s → terminé ; date de clôture ; project.closed ; audit',
      async (status) => {
        const project = await f.created(FIXED);
        await setStatus(project.id, status);
        const before = Date.now();
        const res = await action(project.id, 'close');
        expect(res.status).toBe(200);
        const closed = Project.parse(await res.json());
        expect(closed).toMatchObject({ status: 'completed', version: 2 });
        const closedAt = Date.parse(closed.closedAt ?? '');
        expect(closedAt).toBeGreaterThanOrEqual(before - 5_000);
        expect(closedAt).toBeLessThanOrEqual(Date.now() + 5_000);
        const written = await row(project.id);
        expect(written).toMatchObject({ status: 'completed', version: 2 });
        expect(written?.closed_at?.toISOString()).toBe(closed.closedAt);
        expect(await events('project.closed')).toEqual([
          {
            association_id: A.id,
            actor_user_id: USERS.awa,
            aggregate_id: project.id,
            payload: { projectId: project.id },
          },
        ]);
        const [audit] = await audits('project.close', project.id);
        expect(audit).toMatchObject({
          before: { status, closedAt: null },
          after: { status: 'completed', closedAt: closed.closedAt },
        });
      },
    );

    it.each(['draft', 'completed', 'archived'] as const)('%s : 409 invalid_state, rien n’est écrit', async (status) => {
      const project = await f.created(ROLLING);
      await setStatus(project.id, status);
      const res = await action(project.id, 'close');
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('invalid_state');
      expect(await row(project.id)).toMatchObject({ status, version: 1, closed_at: null });
      expect(await events('project.closed')).toEqual([]);
      expect(await audits('project.close', project.id)).toEqual([]);
    });

    it('clôtures concurrentes : une seule passe', async () => {
      const project = await f.created(ROLLING);
      await setStatus(project.id, 'active');
      // Ligne tenue par une autre transaction : les deux clôtures attendent ensemble, puis passent l'une après l'autre.
      // Sans le verrou de lecture, la seconde ne trouverait plus la version lue (404) au lieu de voir la clôture (409).
      const holder = new pg.Client({ connectionString: f.h.db.superuserUrl });
      await holder.connect();
      let statuses: number[];
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [project.id]);
        const pending = Promise.all([action(project.id, 'close'), action(project.id, 'close')]);
        for (let i = 0; ; i += 1) {
          const { rowCount } = await holder.query(
            'SELECT 1 FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0',
          );
          if (rowCount === 2) break;
          if (i > 200) throw new Error('les deux clôtures n’ont pas attendu le verrou');
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        await holder.query('COMMIT');
        statuses = (await pending).map((x) => x.status).sort();
      } finally {
        await holder.end();
      }
      expect(statuses).toEqual([200, 409]);
      expect(await events('project.closed')).toHaveLength(1);
    });
  });

  describe('duplication', () => {
    it('copie en brouillon : conditions et moyens actifs repris ; ni couverture, ni verrouillage, ni clôture', async () => {
      const original = await f.created({ ...FIXED, coverFileId: await cover() });
      await f.h.superuser(
        `UPDATE projects SET status = 'completed', closed_at = now(), financial_terms_locked_at = now() WHERE id = $1`,
        [original.id],
      );
      const res = await action(original.id, 'duplicate');
      expect(res.status).toBe(201);
      const copy = Project.parse(await res.json());
      expect(copy).toEqual({
        ...original,
        id: expect.any(String) as unknown,
        name: `${FIXED.name} (copie)`,
        coverFileId: null,
        coverFileName: null,
        status: 'draft',
        financialTermsLockedAt: null,
        closedAt: null,
        createdAt: expect.any(String) as unknown,
        version: 1,
      });
      expect(copy.id).not.toBe(original.id);
      const { rows } = await f.h.superuser('SELECT created_by, currency FROM projects WHERE id = $1', [copy.id]);
      expect(rows).toEqual([{ created_by: USERS.awa, currency: 'XOF' }]);
      // Une copie est une création : project.created (choix du 2026-10-25, endpoints.yaml).
      expect(await events('project.created')).toEqual([
        {
          association_id: A.id,
          actor_user_id: USERS.awa,
          aggregate_id: original.id,
          payload: { projectId: original.id },
        },
        { association_id: A.id, actor_user_id: USERS.awa, aggregate_id: copy.id, payload: { projectId: copy.id } },
      ]);
      const [audit] = await audits('project.duplicate', copy.id);
      expect(audit?.after).toMatchObject({
        name: `${FIXED.name} (copie)`,
        status: 'draft',
        duplicatedFrom: original.id,
      });
    });

    it('nom long : ramené à 120 caractères, « (copie) » compris', async () => {
      const original = await f.created({ ...ROLLING, name: 'é'.repeat(120) });
      const copy = Project.parse(await (await action(original.id, 'duplicate')).json());
      expect(copy.name).toBe(`${'é'.repeat(112)} (copie)`);
      expect(copy.name).toHaveLength(120);
      // Un caractère sur deux unités UTF-16 n'est jamais coupé en deux.
      const emoji = await f.created({ ...ROLLING, name: `${'a'.repeat(111)}🙂` });
      const emojiCopy = Project.parse(await (await action(emoji.id, 'duplicate')).json());
      expect(emojiCopy.name).toBe(`${'a'.repeat(111)} (copie)`);
    });

    it('un moyen sur deux désactivé : seul l’actif est repris, avec ses consignes', async () => {
      const cash = '00000000-0000-7000-8000-0000000aa205';
      await f.h.superuser(
        `INSERT INTO association_payment_methods (id, association_id, kind, label, position) VALUES ($1, $2, 'cash', 'Espèces', 3)`,
        [cash, A.id],
      );
      try {
        const original = await f.created({
          ...FIXED,
          paymentMethods: [...FIXED.paymentMethods, { paymentMethodId: cash, instructionsOverride: 'Au trésorier' }],
        });
        await f.h.superuser('UPDATE association_payment_methods SET is_active = false WHERE id = $1', [cash]);
        const copy = Project.parse(await (await action(original.id, 'duplicate')).json());
        expect(copy.paymentMethods).toEqual(FIXED.paymentMethods);
      } finally {
        await f.reset();
        await f.h.superuser('DELETE FROM association_payment_methods WHERE id = $1', [cash]);
      }
    });

    // Plus aucun moyen retenu actif : la copie n'en retient aucun, donc tous ceux de l'association (Q7) ; brouillon à relire.
    it('moyen désactivé depuis : non repris', async () => {
      const original = await f.created(FIXED);
      await f.h.superuser('UPDATE association_payment_methods SET is_active = false WHERE id = $1', [METHODS.orangeA]);
      try {
        const copy = Project.parse(await (await action(original.id, 'duplicate')).json());
        expect(copy.paymentMethods).toEqual([]);
      } finally {
        await f.h.superuser('UPDATE association_payment_methods SET is_active = true WHERE id = $1', [METHODS.orangeA]);
      }
    });

    it('quota du plan atteint : 409 quota_exceeded, rien n’est écrit', async () => {
      await f.h.superuser('UPDATE plans SET max_projects = 1 WHERE id = $1', [PLANS.essentiel]);
      const original = await f.created(ROLLING);
      const res = await action(original.id, 'duplicate');
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: 'quota_exceeded', limit: 1, usage: 1 });
      expect((await f.h.superuser('SELECT 1 FROM projects')).rowCount).toBe(1);
    });
  });

  describe('suppression', () => {
    it('brouillon : supprimé avec ses moyens (204) ; audité', async () => {
      const project = await f.created(FIXED);
      const res = await remove(project.id);
      expect(res.status).toBe(204);
      expect(await row(project.id)).toBeUndefined();
      expect((await f.h.superuser('SELECT 1 FROM project_payment_methods')).rowCount).toBe(0);
      const [audit] = await audits('project.delete', project.id);
      expect(audit).toMatchObject({ before: { name: FIXED.name, status: 'draft' }, after: null });
      expect((await f.call(`/associations/${A.id}/projects/${project.id}`, { token: f.tokens.awa })).status).toBe(404);
    });

    it.each(STATUSES.filter((s) => s !== 'draft'))('%s : 409 invalid_state, rien n’est supprimé', async (status) => {
      const project = await f.created(ROLLING);
      await setStatus(project.id, status);
      const res = await remove(project.id);
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('invalid_state');
      expect(await row(project.id)).toMatchObject({ status });
    });

    it('avec une couverture : supprimé, le fichier reste ; publié avec If-Match périmé : 409 (état d’abord)', async () => {
      const file = await cover();
      const draft = await f.created({ ...ROLLING, coverFileId: file });
      expect((await remove(draft.id)).status).toBe(204);
      expect((await f.h.superuser('SELECT 1 FROM files WHERE id = $1', [file])).rowCount).toBe(1);
      const published = await f.created(ROLLING);
      await setStatus(published.id, 'enrolling');
      const res = await remove(published.id, { version: 7 });
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('invalid_state');
    });

    it('If-Match périmé : 412 ; absent : 422 ; rien n’est supprimé', async () => {
      const project = await f.created(ROLLING);
      const stale = await remove(project.id, { version: 2 });
      expect(stale.status).toBe(412);
      expect(await codeOf(stale)).toBe('version_conflict');
      expect((await remove(project.id, { version: null })).status).toBe(422);
      expect(await row(project.id)).toMatchObject({ status: 'draft' });
    });
  });

  describe('droits et isolation', () => {
    it('manager : permis ; viewer : 403 sur chaque action ; rien n’est écrit', async () => {
      const project = await f.created(ROLLING);
      for (const verb of ['publish', 'close', 'duplicate'] as const) {
        expect({ verb, status: (await action(project.id, verb, f.tokens.koffi)).status }).toEqual({
          verb,
          status: 403,
        });
      }
      expect((await remove(project.id, { token: f.tokens.koffi })).status).toBe(403);
      expect(await row(project.id)).toMatchObject({ status: 'draft', version: 1 });
      expect((await action(project.id, 'publish', f.tokens.aminata)).status).toBe(200);
    });

    it('projet d’une autre association, sous son URL ou celle de A ; souscripteur : 404, rien n’est écrit', async () => {
      const ofB = await f.created(ROLLING, { aid: B.id, token: f.tokens.koffi });
      for (const verb of ['publish', 'close', 'duplicate'] as const) {
        expect((await action(ofB.id, verb)).status).toBe(404);
        expect((await action(ofB.id, verb, f.tokens.aminata, B.id)).status).toBe(404);
        expect((await action(ofB.id, verb, f.tokens.moussa, B.id)).status).toBe(404);
      }
      expect((await remove(ofB.id)).status).toBe(404);
      expect((await remove(ofB.id, { token: f.tokens.aminata, aid: B.id })).status).toBe(404);
      // Ni la version ni l'état d'un projet étranger ne se devinent.
      expect((await remove(ofB.id, { version: 99 })).status).toBe(404);
      const { rows } = await f.h.superuser('SELECT association_id, status, version FROM projects');
      expect(rows).toEqual([{ association_id: B.id, status: 'draft', version: 1 }]);
    });
  });
});
