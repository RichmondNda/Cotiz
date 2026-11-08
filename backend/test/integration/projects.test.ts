import { listOf, Project, ProjectSummary } from '@cotiz/contracts';
import type { z } from 'zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf, PLANS } from './platform-associations.fixture.js';
import { FIXED, METHODS, ROLLING, type ProjectsFixture, startProjectsFixture, xof } from './projects.fixture.js';

/**
 * Lot 2.2 · étape 2 : projets d'une association (pr.create, pr.get, pr.list). Création en brouillon, conditions
 * contrôlées par generateSchedule() de @cotiz/domain (422 sur le champ), devise de l'association, quota du plan
 * (brouillons, inscriptions ouvertes, en cours : Q6), idempotence, audit et project.created. Contrat du projet refusé
 * si le plan ne comprend pas les contrats (lot 4.1, voir contracts-editor.test.ts) ; moyens de paiement de
 * l'association, actifs (Q7) ; couverture déposée par pr.upload. Lecture avec ETag ; liste avec compteurs par statut.
 * Isolation : une autre association, ou un souscripteur, reçoit 404.
 */

const Page = listOf(ProjectSummary);
const ANY_ID: unknown = expect.any(String);

describe('projets (pr.create, pr.get, pr.list)', () => {
  let f: ProjectsFixture;

  const get = (pid: string, aid = A.id, token = f.tokens.awa) =>
    f.call(`/associations/${aid}/projects/${pid}`, { token });
  const list = async (query = '', token = f.tokens.awa, aid = A.id) => {
    const res = await f.call(`/associations/${aid}/projects${query}`, { token });
    expect(res.status).toBe(200);
    return Page.parse(await res.json());
  };
  const fieldsOf = async (res: Response) => ((await res.json()) as { fields?: Record<string, string> }).fields;
  const projectRows = async () =>
    (await f.h.superuser('SELECT id, association_id FROM projects ORDER BY created_at')).rows as {
      id: string;
      association_id: string;
    }[];
  /** Fichier posé en base comme après as.upload / pr.upload et l'analyse du worker. */
  const file = async (aid: string, purpose: string, scan = 'clean') => {
    const id = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                          size_bytes, scan_status, sha256)
       VALUES ($1, $2, $3, $4, 'cotiz-media', $6, 'couverture.png', 'image/png', 10, $5,
               CASE WHEN $5::files_scan_status = 'pending' THEN NULL ELSE repeat('a', 64) END)`,
      [id, aid, USERS.awa, purpose, scan, `projects/${id}`],
    );
    return id;
  };

  beforeAll(async () => {
    f = await startProjectsFixture();
  });

  afterAll(() => f.stop());

  beforeEach(async () => {
    await f.reset();
    await f.h.superuser('UPDATE plans SET max_projects = 5 WHERE id = $1', [PLANS.essentiel]);
  });

  describe('pr.create', () => {
    it('dates fixes : brouillon conforme au contrat, devise de l’association, échéancier du domaine', async () => {
      const res = await f.create(FIXED);
      expect(res.status).toBe(201);
      const project = Project.parse(await res.json());
      expect(project).toEqual({
        ...FIXED,
        id: ANY_ID,
        coverFileId: null,
        coverFileName: null,
        status: 'draft',
        financialTermsLockedAt: null,
        closedAt: null,
        createdAt: ANY_ID,
        version: 1,
        stats: {
          subscribersCount: 0,
          collected: xof(0),
          expectedToDate: xof(0),
          recoveryRate: null,
          progress: null,
          lateSubscribersCount: 0,
          pendingPaymentsCount: 0,
          pendingSignaturesCount: 0,
          nextDueDate: null,
          // Mars 2026 → août 2027, le 5 : 18 échéances ; 50 000 + 18 × 25 000.
          installmentsCount: 18,
          totalPerSubscriber: xof(500000),
        },
      });
      expect(res.headers.get('etag')).toBe('W/"1"');
      const { rows } = await f.h.superuser(
        `SELECT association_id, status, installment_amount, entry_fee_amount, currency, created_by, end_date::text
           FROM projects WHERE id = $1`,
        [project.id],
      );
      expect(rows).toEqual([
        {
          association_id: A.id,
          status: 'draft',
          installment_amount: '25000',
          entry_fee_amount: '50000',
          currency: 'XOF',
          created_by: USERS.awa,
          end_date: '2027-08-31',
        },
      ]);
      const links = await f.h.superuser(
        'SELECT payment_method_id, association_id, instructions_override FROM project_payment_methods WHERE project_id = $1',
        [project.id],
      );
      expect(links.rows).toEqual([
        {
          payment_method_id: METHODS.orangeA,
          association_id: A.id,
          instructions_override: 'Indiquez votre nom en référence',
        },
      ]);
    });

    it('cycle roulant : fin ignorée, ni nombre d’échéances ni total ; fonds d’entrée à 0 = aucun', async () => {
      const project = await f.created({ ...ROLLING, endDate: '2027-01-01', entryFee: xof(0) });
      expect(project).toMatchObject({
        scheduleType: 'rolling',
        endDate: null,
        entryFee: null,
        requiredSubscribers: null,
        paymentMethods: [],
        stats: { installmentsCount: null, totalPerSubscriber: null },
      });
      const { rows } = await f.h.superuser('SELECT end_date, entry_fee_amount FROM projects WHERE id = $1', [
        project.id,
      ]);
      expect(rows).toEqual([{ end_date: null, entry_fee_amount: null }]);
    });

    it('project.created, et création auditée (auteur, association, projet créé)', async () => {
      const since = new Date();
      const project = await f.created(FIXED);
      const events = await f.h.superuser(
        `SELECT association_id, actor_user_id, aggregate_type, aggregate_id, payload FROM outbox_events
          WHERE event_type = 'project.created'`,
      );
      expect(events.rows).toEqual([
        {
          association_id: A.id,
          actor_user_id: USERS.awa,
          aggregate_type: 'project',
          aggregate_id: project.id,
          payload: { projectId: project.id },
        },
      ]);
      const audit = await f.h.superuser(
        `SELECT association_id, actor_user_id, entity_type, after FROM audit_logs
          WHERE action = 'project.create' AND entity_id = $1 AND occurred_at >= $2`,
        [project.id, since],
      );
      expect((audit.rows[0] as { after?: unknown } | undefined)?.after).not.toHaveProperty('stats');
      expect(audit.rows).toEqual([
        {
          association_id: A.id,
          actor_user_id: USERS.awa,
          entity_type: 'project',
          after: expect.objectContaining({
            name: FIXED.name,
            status: 'draft',
            installmentAmount: xof(25000),
          }) as unknown,
        },
      ]);
    });

    it('manager : permis ; viewer : 403 ; rien n’est écrit', async () => {
      expect((await f.create(ROLLING, { token: f.tokens.aminata })).status).toBe(201);
      const res = await f.create(ROLLING, { token: f.tokens.koffi });
      expect(res.status).toBe(403);
      expect(await projectRows()).toHaveLength(1);
    });

    describe('conditions contrôlées par le domaine : 422 validation_failed sur le champ, rien n’est écrit', () => {
      it.each([
        ['hebdomadaire, jour 9', { ...ROLLING, dueDay: 9 }, 'dueDay', 'invalid_due_day'],
        ['dates fixes sans fin', { ...FIXED, endDate: null }, 'endDate', 'end_date_required'],
        ['fin avant le début', { ...FIXED, endDate: '2026-02-01' }, 'endDate', 'end_before_start'],
        ['année hors bornes', { ...FIXED, startDate: '1800-01-01' }, 'startDate', 'invalid_date'],
        ['montant nul', { ...FIXED, installmentAmount: xof(0) }, 'installmentAmount', 'invalid_amount'],
        ['fonds d’entrée négatif', { ...FIXED, entryFee: xof(-1) }, 'entryFee', 'invalid_amount'],
        [
          'montant dans une autre devise',
          { ...FIXED, installmentAmount: { amount: 25000, currency: 'XAF' } },
          'installmentAmount',
          'currency_mismatch',
        ],
        [
          'fonds d’entrée dans une autre devise',
          { ...FIXED, entryFee: { amount: 1000, currency: 'GNF' } },
          'entryFee',
          'currency_mismatch',
        ],
        [
          'fonds d’entrée à 0 dans une autre devise',
          { ...FIXED, entryFee: { amount: 0, currency: 'GNF' } },
          'entryFee',
          'currency_mismatch',
        ],
        // Du 6 au 31 mars, le 5 : aucune date, et le fonds d'entrée n'aurait pas de date.
        [
          'dates fixes sans aucune échéance',
          { ...FIXED, startDate: '2026-03-06', endDate: '2026-03-31' },
          'endDate',
          'no_installment',
        ],
        [
          'total par souscripteur au-delà des entiers sûrs',
          { ...FIXED, installmentAmount: xof(1_000_000_000_000_000) },
          'installmentAmount',
          'total_too_large',
        ],
      ])('%s', async (_why, body, field, code) => {
        const res = await f.create(body);
        expect(res.status).toBe(422);
        expect(await fieldsOf(res)).toEqual({ [field]: code });
        expect(await projectRows()).toEqual([]);
      });
    });

    it('association en XAF : projet dans sa devise ; montants en XOF refusés', async () => {
      await f.h.superuser(`UPDATE associations SET currency = 'XAF' WHERE id = $1`, [A.id]);
      try {
        const xaf = (amount: number) => ({ amount, currency: 'XAF' });
        const project = await f.created({ ...FIXED, entryFee: xaf(50000), installmentAmount: xaf(25000) });
        expect(project).toMatchObject({
          entryFee: xaf(50000),
          installmentAmount: xaf(25000),
          stats: { collected: xaf(0), expectedToDate: xaf(0), totalPerSubscriber: xaf(500000) },
        });
        expect((await f.h.superuser('SELECT currency FROM projects')).rows).toEqual([{ currency: 'XAF' }]);
        const res = await f.create(FIXED);
        expect(res.status).toBe(422);
        expect(await fieldsOf(res)).toEqual({ installmentAmount: 'currency_mismatch', entryFee: 'currency_mismatch' });
      } finally {
        await f.h.superuser(`UPDATE associations SET currency = 'XOF' WHERE id = $1`, [A.id]);
      }
    });

    it('contrat saisi à la création, plan sans contrats : 403 feature_disabled (lot 4.1), rien n’est écrit', async () => {
      const contract = {
        bodyTemplate: 'Je soussigné {nom_souscripteur}…',
        signerName: 'Awa Koné',
        signerTitle: 'Présidente',
        signNow: true,
      };
      const res = await f.create({ ...FIXED, contract });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe('feature_disabled');
      expect(await projectRows()).toEqual([]);
    });

    describe('moyens de paiement : ceux de l’association, actifs, une fois chacun (Q7)', () => {
      it.each([
        ['moyen inactif', [METHODS.waveInactiveA], 'paymentMethods.0.paymentMethodId', 'not_available'],
        ['moyen d’une autre association', [METHODS.bankB], 'paymentMethods.0.paymentMethodId', 'not_available'],
        [
          'moyen inconnu',
          ['00000000-0000-7000-8000-0000000aa2ff'],
          'paymentMethods.0.paymentMethodId',
          'not_available',
        ],
        ['même moyen deux fois', [METHODS.orangeA, METHODS.orangeA], 'paymentMethods.1.paymentMethodId', 'duplicate'],
      ])('%s : 422, rien n’est écrit', async (_why, ids, field, code) => {
        const paymentMethods = ids.map((paymentMethodId) => ({ paymentMethodId, instructionsOverride: null }));
        const res = await f.create({ ...FIXED, paymentMethods });
        expect(res.status).toBe(422);
        expect(await fieldsOf(res)).toEqual({ [field]: code });
        expect(await projectRows()).toEqual([]);
        expect((await f.h.superuser('SELECT 1 FROM project_payment_methods')).rowCount).toBe(0);
      });
    });

    describe('couverture : fichier de l’association, usage cover, analysé sain', () => {
      it('couverture saine : rattachée, nom du fichier renvoyé', async () => {
        const cover = await file(A.id, 'cover');
        const project = await f.created({ ...FIXED, coverFileId: cover });
        expect(project).toMatchObject({ coverFileId: cover, coverFileName: 'couverture.png' });
        expect((await f.h.superuser('SELECT cover_file_id FROM projects')).rows).toEqual([{ cover_file_id: cover }]);
      });

      it('non analysée, infectée, logo, d’une autre association ou inconnue : 422, rien n’est écrit', async () => {
        const covers = [
          await file(A.id, 'cover', 'pending'),
          await file(A.id, 'cover', 'infected'),
          await file(A.id, 'logo'),
          await file(B.id, 'cover'),
          '00000000-0000-7000-8000-0000000f0fff',
        ];
        for (const coverFileId of covers) {
          const res = await f.create({ ...FIXED, coverFileId });
          expect({ coverFileId, status: res.status, fields: await fieldsOf(res) }).toEqual({
            coverFileId,
            status: 422,
            fields: { coverFileId: 'invalid' },
          });
        }
        expect(await projectRows()).toEqual([]);
      });
    });

    describe('quota du plan (Q6)', () => {
      it('limite atteinte : 409 quota_exceeded avec limit et usage, rien n’est écrit', async () => {
        await f.h.superuser('UPDATE plans SET max_projects = 2 WHERE id = $1', [PLANS.essentiel]);
        const first = await f.created(ROLLING);
        await f.created(FIXED);
        const res = await f.create(ROLLING);
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ code: 'quota_exceeded', limit: 2, usage: 2 });
        // Inscriptions ouvertes ou en cours : toujours compté ; terminé : une place se libère.
        for (const status of ['enrolling', 'active']) {
          await f.h.superuser(`UPDATE projects SET status = $2 WHERE id = $1`, [first.id, status]);
          expect({ status, code: (await f.create(ROLLING)).status }).toEqual({ status, code: 409 });
        }
        await f.h.superuser(`UPDATE projects SET status = 'completed' WHERE id = $1`, [first.id]);
        expect((await f.create(ROLLING)).status).toBe(201);
        expect(await projectRows()).toHaveLength(3);
      });

      it('projets d’une autre association jamais comptés', async () => {
        await f.h.superuser('UPDATE plans SET max_projects = 1 WHERE id = $1', [PLANS.essentiel]);
        await f.created(ROLLING, { aid: B.id, token: f.tokens.koffi });
        expect((await f.create(ROLLING)).status).toBe(201);
      });

      it('créations concurrentes : une seule passe la dernière place', async () => {
        await f.h.superuser('UPDATE plans SET max_projects = 1 WHERE id = $1', [PLANS.essentiel]);
        const statuses = await Promise.all([f.create(ROLLING), f.create(FIXED), f.create(ROLLING)]).then((r) =>
          r.map((x) => x.status).sort(),
        );
        expect(statuses).toEqual([201, 409, 409]);
        expect(await projectRows()).toHaveLength(1);
      });
    });

    describe('idempotence', () => {
      it('même clé, même corps : même réponse, un seul projet, un seul événement', async () => {
        const key = crypto.randomUUID();
        const first = await f.create(FIXED, { key });
        const again = await f.create(FIXED, { key });
        expect([first.status, again.status]).toEqual([201, 201]);
        expect(await again.json()).toEqual(await first.json());
        expect(await projectRows()).toHaveLength(1);
        const events = await f.h.superuser(`SELECT 1 FROM outbox_events WHERE event_type = 'project.created'`);
        expect(events.rowCount).toBe(1);
      });

      it('même clé envoyée deux fois en même temps : un seul projet, un seul événement', async () => {
        const key = crypto.randomUUID();
        const statuses = await Promise.all([f.create(FIXED, { key }), f.create(FIXED, { key })]).then((r) =>
          r.map((x) => x.status),
        );
        // L'autre attend (rejoue la même réponse) ou est refusé tant que la première est en cours (409 invalid_state).
        expect(statuses).toContain(201);
        expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
        expect(await projectRows()).toHaveLength(1);
        const events = await f.h.superuser(`SELECT 1 FROM outbox_events WHERE event_type = 'project.created'`);
        expect(events.rowCount).toBe(1);
      });

      it('même clé, autre corps : 422 idempotency_key_reused ; sans clé : 422', async () => {
        const key = crypto.randomUUID();
        await f.create(FIXED, { key });
        const reused = await f.create(ROLLING, { key });
        expect(reused.status).toBe(422);
        expect(await codeOf(reused)).toBe('idempotency_key_reused');
        const missing = await f.call(`/associations/${A.id}/projects`, {
          token: f.tokens.awa,
          method: 'POST',
          body: FIXED,
        });
        expect(missing.status).toBe(422);
        expect(await missing.json()).toMatchObject({
          code: 'validation_failed',
          fields: { 'Idempotency-Key': 'required' },
        });
        expect(await projectRows()).toHaveLength(1);
      });
    });
  });

  describe('pr.get', () => {
    it('le projet créé, avec ETag ; lu par un viewer', async () => {
      const project = await f.created(FIXED);
      for (const token of [f.tokens.awa, f.tokens.koffi]) {
        const res = await get(project.id, A.id, token);
        expect(res.status).toBe(200);
        expect(res.headers.get('etag')).toBe('W/"1"');
        expect(Project.parse(await res.json())).toEqual(project);
      }
    });

    it('moyens de paiement relus dans l’ordre de ceux de l’association (as.pm.list), pas dans celui de la saisie', async () => {
      await f.h.superuser(
        `INSERT INTO association_payment_methods (id, association_id, kind, label, position) VALUES ($1, $2, 'cash', 'Espèces', 2)`,
        ['00000000-0000-7000-8000-0000000aa204', A.id],
      );
      try {
        const paymentMethods = [
          { paymentMethodId: '00000000-0000-7000-8000-0000000aa204', instructionsOverride: null },
          { paymentMethodId: METHODS.orangeA, instructionsOverride: 'Référence : votre nom' },
        ];
        const project = await f.created({ ...FIXED, paymentMethods });
        const expected = [paymentMethods[1], paymentMethods[0]];
        expect(project.paymentMethods).toEqual(expected);
        expect(Project.parse(await (await get(project.id)).json()).paymentMethods).toEqual(expected);
      } finally {
        await f.reset();
        await f.h.superuser(
          `DELETE FROM association_payment_methods WHERE id = '00000000-0000-7000-8000-0000000aa204'`,
        );
      }
    });

    it('inconnu : 404 not_found', async () => {
      const res = await get('00000000-0000-7000-8000-00000000c2ff');
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
    });
  });

  describe('pr.list', () => {
    it('projets de l’association, le plus récent d’abord, compteurs par statut avec les autres filtres', async () => {
      const a1 = await f.created({ ...ROLLING, name: 'Tontine du samedi' });
      const a2 = await f.created({ ...FIXED, name: 'Centre communautaire' });
      const a3 = await f.created({ ...ROLLING, name: 'Caisse de solidarité' });
      await f.h.superuser(`UPDATE projects SET status = 'active' WHERE id = $1`, [a2.id]);
      await f.created(ROLLING, { aid: B.id, token: f.tokens.koffi });

      const page = await list();
      expect(page.items.map((p) => p.id)).toEqual([a3.id, a2.id, a1.id]);
      expect(page).toMatchObject({ total: 3, nextCursor: null });
      expect(page.facets).toEqual({ status: { draft: 2, enrolling: 0, active: 1, completed: 0, archived: 0 } });
      expect(page.items[1]).toMatchObject({
        name: 'Centre communautaire',
        status: 'active',
        stats: { installmentsCount: 18 },
      });
      expect(page.items[1]).not.toHaveProperty('description');

      const drafts = await list('?status=draft');
      expect(drafts.items.map((p) => p.id)).toEqual([a3.id, a1.id]);
      expect(drafts).toMatchObject({ total: 2, facets: page.facets });
    });

    it('recherche par nom, sans casse ; % est un caractère, pas un joker', async () => {
      await f.created({ ...ROLLING, name: 'Tontine du samedi' });
      await f.created({ ...ROLLING, name: 'Caisse 100% solidaire' });
      // Trouvés si % ou _ étaient des jokers.
      await f.created({ ...ROLLING, name: 'Caisse 1000 solidaire' });
      await f.created({ ...ROLLING, name: 'Fonds axb' });
      await f.created({ ...ROLLING, name: 'Fonds a_b' });
      expect((await list('?q=TONTINE')).items.map((p) => p.name)).toEqual(['Tontine du samedi']);
      expect((await list('?q=100%25')).items.map((p) => p.name)).toEqual(['Caisse 100% solidaire']);
      expect((await list('?q=a_b')).items.map((p) => p.name)).toEqual(['Fonds a_b']);
      const search = await list('?q=samedi&status=draft');
      expect(search).toMatchObject({ total: 1, facets: { status: { draft: 1 } } });
    });

    it('pages par curseur, sans doublon ni oubli ni page vide, dans les deux sens de tri ; ex æquo départagés par id', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 4; i += 1) ids.push((await f.created({ ...ROLLING, name: `Projet ${String(i)}` })).id);
      // Les deux du milieu, créés au même instant : l'id (UUIDv7, croissant) les départage.
      await f.h.superuser(
        'UPDATE projects SET created_at = (SELECT created_at FROM projects WHERE id = $1) WHERE id = $2',
        [ids[1], ids[2]],
      );
      for (const [sort, expected] of [
        ['-createdAt', [...ids].reverse()],
        ['createdAt', ids],
      ] as const) {
        const seen: string[] = [];
        let cursor: string | null = null;
        let pages = 0;
        do {
          pages += 1;
          const page: z.infer<typeof Page> = await list(
            `?limit=2&sort=${sort}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          );
          seen.push(...page.items.map((p) => p.id));
          cursor = page.nextCursor;
        } while (cursor);
        expect({ sort, seen, pages }).toEqual({ sort, seen: expected, pages: 2 });
      }
    });

    it('tri inconnu ou curseur illisible : 422 validation_failed', async () => {
      for (const [query, fields] of [
        ['?sort=name', { sort: 'unknown_sort' }],
        ['?cursor=illisible', { cursor: 'invalid' }],
      ] as const) {
        const res = await f.call(`/associations/${A.id}/projects${query}`, { token: f.tokens.awa });
        expect({ query, status: res.status, body: await res.json() }).toMatchObject({
          query,
          status: 422,
          body: { code: 'validation_failed', fields },
        });
      }
    });

    it('nom du fichier de couverture dans la liste', async () => {
      const cover = await file(A.id, 'cover');
      await f.created({ ...FIXED, coverFileId: cover });
      await f.created(ROLLING);
      expect((await list()).items.map((p) => [p.coverFileId, p.coverFileName])).toEqual([
        [null, null],
        [cover, 'couverture.png'],
      ]);
    });

    it('viewer : lecture permise', async () => {
      await f.created(ROLLING);
      expect((await list('', f.tokens.koffi)).total).toBe(1);
    });
  });

  describe('isolation', () => {
    it('association dont on n’est pas gestionnaire : 404 en lecture, en liste et en création, rien n’est écrit', async () => {
      const ofB = await f.created(ROLLING, { aid: B.id, token: f.tokens.koffi });
      // Aminata n'est que manager de A.
      expect((await get(ofB.id, B.id, f.tokens.aminata)).status).toBe(404);
      expect((await f.call(`/associations/${B.id}/projects`, { token: f.tokens.aminata })).status).toBe(404);
      expect((await f.create(ROLLING, { aid: B.id, token: f.tokens.aminata })).status).toBe(404);
      expect((await projectRows()).map((r) => r.association_id)).toEqual([B.id]);
    });

    it('projet de B lu sous l’URL de A, même par un gestionnaire des deux : 404', async () => {
      // Koffi : owner de B, viewer de A.
      const ofB = await f.created(ROLLING, { aid: B.id, token: f.tokens.koffi });
      const res = await get(ofB.id, A.id, f.tokens.koffi);
      expect(res.status).toBe(404);
      expect((await list('', f.tokens.koffi)).items).toEqual([]);
    });

    it('jeton souscripteur : 404 sur chaque route', async () => {
      const project = await f.created(ROLLING);
      const moussa = f.tokens.moussa;
      expect((await get(project.id, A.id, moussa)).status).toBe(404);
      expect((await f.call(`/associations/${A.id}/projects`, { token: moussa })).status).toBe(404);
      expect((await f.create(ROLLING, { token: moussa })).status).toBe(404);
    });
  });
});
