import { Project } from '@cotiz/contracts';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf } from './platform-associations.fixture.js';
import { FIXED, METHODS, ROLLING, type ProjectsFixture, startProjectsFixture, xof } from './projects.fixture.js';

/**
 * Lot 2.2 · étape 3 : modification d'un projet (pr.patch) sous verrou optimiste (If-Match, 412 version_conflict).
 * Seuls les champs envoyés changent ; conditions financières recontrôlées par generateSchedule() comme à la création,
 * refusées une fois verrouillées (`financial_terms_locked`, domain-rules § 9 : nom, description, couverture, délai de
 * grâce et moyens de paiement restent modifiables). Projet terminé ou archivé : 409 invalid_state (choix Q8).
 * project.updated avec les champs modifiés ; modification auditée. Vérification de l'étape : projet verrouillé.
 */

describe('modification d’un projet (pr.patch)', () => {
  let f: ProjectsFixture;

  const patch = (pid: string, body: unknown, options: { version?: number | null; token?: string; aid?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/projects/${pid}`, {
      token: options.token ?? f.tokens.awa,
      method: 'PATCH',
      body,
      headers: options.version === null ? {} : { 'if-match': `W/"${String(options.version ?? 1)}"` },
    });
  const patched = async (pid: string, body: unknown, version = 1) => {
    const res = await patch(pid, body, { version });
    expect(res.status).toBe(200);
    return Project.parse(await res.json());
  };
  const fieldsOf = async (res: Response) => ((await res.json()) as { fields?: Record<string, string> }).fields;
  const row = async (pid: string) =>
    (
      await f.h.superuser(
        `SELECT name, version, installment_amount, entry_fee_amount, frequency, due_day, schedule_type,
                start_date::text, end_date::text, cover_file_id FROM projects WHERE id = $1`,
        [pid],
      )
    ).rows[0] as Record<string, unknown>;
  const updates = async (pid: string) =>
    (
      await f.h.superuser(
        `SELECT actor_user_id, payload FROM outbox_events WHERE event_type = 'project.updated' AND aggregate_id = $1
          ORDER BY id`,
        [pid],
      )
    ).rows as { actor_user_id: string; payload: { projectId: string; changedFields: string[] } }[];
  const audits = async (pid: string) =>
    (
      await f.h.superuser(
        `SELECT actor_user_id, association_id, before, after FROM audit_logs
          WHERE action = 'project.update' AND entity_id = $1 ORDER BY occurred_at`,
        [pid],
      )
    ).rows as Record<string, unknown>[];
  const lock = (pid: string) =>
    f.h.superuser('UPDATE projects SET financial_terms_locked_at = now() WHERE id = $1', [pid]);
  const cover = async (aid: string) => {
    const id = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                          size_bytes, scan_status, sha256)
       VALUES ($1, $2, $3, 'cover', 'cotiz-media', $4, 'nouvelle.png', 'image/png', 10, 'clean', repeat('b', 64))`,
      [id, aid, USERS.awa, `projects/${id}`],
    );
    return id;
  };

  beforeAll(async () => {
    f = await startProjectsFixture();
  });

  afterAll(() => f.stop());

  beforeEach(() => f.reset());

  describe('champs non financiers', () => {
    it('seuls les champs envoyés changent ; version suivante, ETag ; project.updated et audit', async () => {
      const project = await f.created(FIXED);
      const res = await patch(project.id, { name: 'Centre de Yopougon', graceDays: 10, requiredSubscribers: null });
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBe('W/"2"');
      const after = Project.parse(await res.json());
      expect(after).toEqual({
        ...project,
        name: 'Centre de Yopougon',
        graceDays: 10,
        requiredSubscribers: null,
        version: 2,
      });
      expect(await row(project.id)).toMatchObject({ name: 'Centre de Yopougon', version: 2 });
      expect(await updates(project.id)).toEqual([
        {
          actor_user_id: USERS.awa,
          payload: { projectId: project.id, changedFields: ['name', 'requiredSubscribers', 'graceDays'] },
        },
      ]);
      expect(await audits(project.id)).toEqual([
        {
          actor_user_id: USERS.awa,
          association_id: A.id,
          before: { name: FIXED.name, requiredSubscribers: 60, graceDays: 5 },
          after: { name: 'Centre de Yopougon', requiredSubscribers: null, graceDays: 10 },
        },
      ]);
    });

    it('valeurs inchangées : version suivante, aucun événement', async () => {
      const project = await f.created(FIXED);
      const res = await patch(project.id, {
        name: FIXED.name,
        installmentAmount: xof(25000),
        paymentMethods: FIXED.paymentMethods,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBe('W/"2"');
      expect(Project.parse(await res.json()).version).toBe(2);
      expect(await updates(project.id)).toEqual([]);
    });

    it('moyens de paiement remplacés (liste vide : ceux de l’association) ; refusés comme à la création', async () => {
      const project = await f.created(FIXED);
      const none = await patched(project.id, { paymentMethods: [] });
      expect(none.paymentMethods).toEqual([]);
      const again = await patched(
        project.id,
        { paymentMethods: [{ paymentMethodId: METHODS.orangeA, instructionsOverride: null }] },
        2,
      );
      expect(again.paymentMethods).toEqual([{ paymentMethodId: METHODS.orangeA, instructionsOverride: null }]);
      expect((await updates(project.id)).map((e) => e.payload.changedFields)).toEqual([
        ['paymentMethods'],
        ['paymentMethods'],
      ]);
      for (const id of [METHODS.waveInactiveA, METHODS.bankB]) {
        const res = await patch(
          project.id,
          { paymentMethods: [{ paymentMethodId: id, instructionsOverride: null }] },
          {
            version: 3,
          },
        );
        expect(res.status).toBe(422);
        expect(await fieldsOf(res)).toEqual({ 'paymentMethods.0.paymentMethodId': 'not_available' });
      }
      const twice = { paymentMethodId: METHODS.orangeA, instructionsOverride: null };
      const duplicate = await patch(project.id, { paymentMethods: [twice, twice] }, { version: 3 });
      expect(await fieldsOf(duplicate)).toEqual({ 'paymentMethods.1.paymentMethodId': 'duplicate' });
      expect(await row(project.id)).toMatchObject({ version: 3 });
      const links = await f.h.superuser('SELECT payment_method_id FROM project_payment_methods WHERE project_id = $1', [
        project.id,
      ]);
      expect(links.rows).toEqual([{ payment_method_id: METHODS.orangeA }]);
    });

    it('couverture : remplacée, retirée ; d’une autre association : 422', async () => {
      const project = await f.created(FIXED);
      const mine = await cover(A.id);
      expect(await patched(project.id, { coverFileId: mine })).toMatchObject({
        coverFileId: mine,
        coverFileName: 'nouvelle.png',
      });
      const foreign = await patch(project.id, { coverFileId: await cover(B.id) }, { version: 2 });
      expect(foreign.status).toBe(422);
      expect(await fieldsOf(foreign)).toEqual({ coverFileId: 'invalid' });
      // Couverture actuelle renvoyée : acceptée sans nouveau contrôle, même devenue inutilisable.
      await f.h.superuser(`UPDATE files SET scan_status = 'infected' WHERE id = $1`, [mine]);
      expect(await patched(project.id, { coverFileId: mine, name: 'Avec couverture' }, 2)).toMatchObject({
        coverFileId: mine,
      });
      const foreignAgain = await patch(project.id, { coverFileId: await cover(B.id) }, { version: 3 });
      expect(await fieldsOf(foreignAgain)).toEqual({ coverFileId: 'invalid' });
      expect(await patched(project.id, { coverFileId: null }, 3)).toMatchObject({
        coverFileId: null,
        coverFileName: null,
      });
      expect((await updates(project.id)).map((e) => e.payload.changedFields)).toEqual([
        ['coverFileId'],
        ['name'],
        ['coverFileId'],
      ]);
    });

    it('corps vide : 422', async () => {
      const project = await f.created(FIXED);
      const res = await patch(project.id, {});
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ code: 'validation_failed', fields: { _: 'empty' } });
      expect(await row(project.id)).toMatchObject({ version: 1 });
    });
  });

  describe('conditions financières non verrouillées', () => {
    it('modifiées : contrôlées sur le projet entier, indicateurs recalculés', async () => {
      const project = await f.created(FIXED);
      // Mars 2026 → décembre 2026, le 5 : 10 échéances ; 50 000 + 10 × 30 000.
      const after = await patched(project.id, { installmentAmount: xof(30000), endDate: '2026-12-31' });
      expect(after).toMatchObject({
        installmentAmount: xof(30000),
        endDate: '2026-12-31',
        stats: { installmentsCount: 10, totalPerSubscriber: xof(350000) },
      });
      expect(await row(project.id)).toMatchObject({ installment_amount: '30000', end_date: '2026-12-31' });
      expect((await updates(project.id)).map((e) => e.payload.changedFields)).toEqual([
        ['installmentAmount', 'endDate'],
      ]);
      expect(await audits(project.id)).toEqual([
        {
          actor_user_id: USERS.awa,
          association_id: A.id,
          before: { installmentAmount: xof(25000), endDate: '2027-08-31' },
          after: { installmentAmount: xof(30000), endDate: '2026-12-31' },
        },
      ]);
    });

    it('fréquence, jour et début modifiés : écrits, indicateurs recalculés', async () => {
      const project = await f.created(FIXED);
      // Trimestriel, le 10, d'avril 2026 à août 2027 : avril, juillet, octobre 2026, janvier, avril, juillet 2027.
      const after = await patched(project.id, { frequency: 'quarterly', dueDay: 10, startDate: '2026-04-01' });
      expect(after.stats).toMatchObject({ installmentsCount: 6, totalPerSubscriber: xof(50000 + 6 * 25000) });
      expect(await row(project.id)).toMatchObject({ frequency: 'quarterly', due_day: 10, start_date: '2026-04-01' });
      expect((await updates(project.id)).map((e) => e.payload.changedFields)).toEqual([
        ['frequency', 'dueDay', 'startDate'],
      ]);
    });

    it('passage en cycle roulant : fin effacée ; fonds d’entrée à 0 : aucun', async () => {
      const project = await f.created(FIXED);
      const after = await patched(project.id, { scheduleType: 'rolling', entryFee: xof(0) });
      expect(after).toMatchObject({ scheduleType: 'rolling', endDate: null, entryFee: null });
      expect(await row(project.id)).toMatchObject({ schedule_type: 'rolling', end_date: null, entry_fee_amount: null });
      expect((await updates(project.id)).map((e) => e.payload.changedFields)).toEqual([
        ['entryFee', 'scheduleType', 'endDate'],
      ]);
    });

    it.each([
      ['jour hebdomadaire hors bornes', { frequency: 'weekly', dueDay: 9 }, 'dueDay', 'invalid_due_day'],
      ['fin avant le début (début seul modifié)', { startDate: '2027-09-01' }, 'endDate', 'end_before_start'],
      ['dates fixes sans échéance', { startDate: '2027-08-06' }, 'endDate', 'no_installment'],
      ['autre devise', { installmentAmount: { amount: 1, currency: 'XAF' } }, 'installmentAmount', 'currency_mismatch'],
      ['montant nul', { installmentAmount: xof(0) }, 'installmentAmount', 'invalid_amount'],
      [
        'fonds d’entrée dans une autre devise',
        { entryFee: { amount: 0, currency: 'GNF' } },
        'entryFee',
        'currency_mismatch',
      ],
      [
        'total au-delà des entiers sûrs',
        { installmentAmount: xof(1_000_000_000_000_000) },
        'installmentAmount',
        'total_too_large',
      ],
    ])('%s : 422 sur le champ, rien n’est écrit', async (_why, body, field, code) => {
      const project = await f.created(FIXED);
      const res = await patch(project.id, body);
      expect(res.status).toBe(422);
      expect(await fieldsOf(res)).toEqual({ [field]: code });
      expect(await row(project.id)).toMatchObject({ version: 1, installment_amount: '25000', end_date: '2027-08-31' });
    });
  });

  describe('conditions financières verrouillées (premier paiement validé)', () => {
    it.each([
      ['montant d’échéance', { installmentAmount: xof(30000) }, ['installmentAmount']],
      ['fonds d’entrée', { entryFee: null }, ['entryFee']],
      ['fréquence', { frequency: 'quarterly' }, ['frequency']],
      ['jour d’échéance', { dueDay: 10 }, ['dueDay']],
      // Le cycle roulant efface aussi la fin : deux conditions changent.
      ['type de calendrier', { scheduleType: 'rolling' }, ['scheduleType', 'endDate']],
      ['date de début', { startDate: '2026-04-01' }, ['startDate']],
      ['date de fin', { endDate: '2027-12-31' }, ['endDate']],
    ])('%s modifié : 409 financial_terms_locked, rien n’est écrit', async (_why, body, fields) => {
      const project = await f.created(FIXED);
      await lock(project.id);
      const res = await patch(project.id, { ...body, name: 'Autre nom' });
      expect(res.status).toBe(409);
      const problem = (await res.json()) as { code: string; fields: unknown };
      expect(problem).toMatchObject({ code: 'financial_terms_locked' });
      expect(problem.fields).toEqual(Object.fromEntries(fields.map((f) => [f, 'locked'])));
      expect(await row(project.id)).toMatchObject({ name: FIXED.name, version: 1, installment_amount: '25000' });
      expect(await updates(project.id)).toEqual([]);
      expect(await audits(project.id)).toEqual([]);
    });

    it('nom, description, couverture, délai de grâce, moyens : modifiables ; conditions renvoyées à l’identique : acceptées', async () => {
      const project = await f.created(FIXED);
      await lock(project.id);
      const mine = await cover(A.id);
      const after = await patched(project.id, {
        name: 'Centre de Yopougon',
        description: 'Nouvelle description',
        coverFileId: mine,
        graceDays: 7,
        paymentMethods: [],
        installmentAmount: xof(25000),
        endDate: '2027-08-31',
      });
      expect(after).toMatchObject({
        name: 'Centre de Yopougon',
        description: 'Nouvelle description',
        coverFileId: mine,
        graceDays: 7,
        paymentMethods: [],
        installmentAmount: xof(25000),
        financialTermsLockedAt: expect.any(String) as unknown,
      });
      expect((await updates(project.id)).map((e) => e.payload.changedFields)).toEqual([
        ['name', 'description', 'coverFileId', 'graceDays', 'paymentMethods'],
      ]);
    });
  });

  describe('conditions verrouillées : normalisation et course avec le verrouillage', () => {
    it('cycle roulant avec une fin, fonds d’entrée à 0 sans fonds : identiques après normalisation, acceptés', async () => {
      const project = await f.created(ROLLING);
      await lock(project.id);
      const after = await patched(project.id, { endDate: '2027-01-01', entryFee: xof(0) });
      expect(after).toMatchObject({ endDate: null, entryFee: null, version: 2 });
      expect(await updates(project.id)).toEqual([]);
    });

    it('verrouillage validé pendant la modification : celle-ci attend, puis 409 financial_terms_locked', async () => {
      const project = await f.created(FIXED);
      // Validation du premier paiement (lot 2.4) en cours : verrou de la ligne pris, pas encore validé.
      const validation = new pg.Client({ connectionString: f.h.db.superuserUrl });
      await validation.connect();
      try {
        await validation.query('BEGIN');
        await validation.query('UPDATE projects SET financial_terms_locked_at = now() WHERE id = $1', [project.id]);
        let settled = false;
        const pending = patch(project.id, { installmentAmount: xof(30000) }).finally(() => {
          settled = true;
        });
        // La modification doit attendre le verrou de la ligne, pas lire avant ou après le COMMIT.
        const [{ pid } = { pid: 0 }] = (await validation.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows;
        for (let i = 0; ; i += 1) {
          const { rowCount } = await validation.query(
            'SELECT 1 FROM pg_stat_activity WHERE $1 = ANY (pg_blocking_pids(pid))',
            [pid],
          );
          if (rowCount) break;
          if (i > 200) throw new Error('la modification n’a jamais attendu le verrou');
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(settled).toBe(false);
        await validation.query('COMMIT');
        const res = await pending;
        expect(res.status).toBe(409);
        expect(await codeOf(res)).toBe('financial_terms_locked');
      } finally {
        await validation.end();
      }
      expect(await row(project.id)).toMatchObject({ installment_amount: '25000', version: 1 });
    });
  });

  describe('verrou optimiste et état', () => {
    it('If-Match périmé : 412 version_conflict ; absent : 422 ; rien n’est écrit', async () => {
      const project = await f.created(FIXED);
      await patched(project.id, { name: 'Première modification' });
      const stale = await patch(project.id, { name: 'Seconde' }, { version: 1 });
      expect(stale.status).toBe(412);
      expect(await codeOf(stale)).toBe('version_conflict');
      const missing = await patch(project.id, { name: 'Seconde' }, { version: null });
      expect(missing.status).toBe(422);
      expect(await missing.json()).toMatchObject({ fields: { 'If-Match': 'required' } });
      expect(await row(project.id)).toMatchObject({ name: 'Première modification', version: 2 });
    });

    it('modifications concurrentes de la même version : une seule passe', async () => {
      const project = await f.created(FIXED);
      const statuses = await Promise.all([
        patch(project.id, { name: 'Un' }),
        patch(project.id, { name: 'Deux' }),
        patch(project.id, { name: 'Trois' }),
      ]).then((r) => r.map((x) => x.status).sort());
      expect(statuses).toEqual([200, 412, 412]);
      const written = await row(project.id);
      expect(written).toMatchObject({ version: 2 });
      expect(['Un', 'Deux', 'Trois']).toContain(written.name);
    });

    it('inscriptions ouvertes ou en cours : modifiable ; terminé ou archivé : 409 invalid_state', async () => {
      const project = await f.created(ROLLING);
      let version = 1;
      for (const status of ['enrolling', 'active']) {
        await f.h.superuser('UPDATE projects SET status = $2 WHERE id = $1', [project.id, status]);
        expect((await patched(project.id, { name: `En ${status}` }, version)).status).toBe(status);
        version += 1;
      }
      for (const status of ['completed', 'archived']) {
        await f.h.superuser('UPDATE projects SET status = $2 WHERE id = $1', [project.id, status]);
        const res = await patch(project.id, { name: 'Trop tard' }, { version });
        expect({ status, code: res.status, error: await codeOf(res) }).toEqual({
          status,
          code: 409,
          error: 'invalid_state',
        });
      }
      expect(await row(project.id)).toMatchObject({ name: 'En active', version: 3 });
    });
  });

  describe('droits et isolation', () => {
    it('manager : permis ; viewer : 403 ; rien n’est écrit', async () => {
      const project = await f.created(FIXED);
      expect((await patch(project.id, { name: 'Par Aminata' }, { token: f.tokens.aminata })).status).toBe(200);
      expect((await patch(project.id, { name: 'Par Koffi' }, { token: f.tokens.koffi, version: 2 })).status).toBe(403);
      expect(await row(project.id)).toMatchObject({ name: 'Par Aminata', version: 2 });
    });

    it('projet d’une autre association, sous son URL ou sous celle de A ; souscripteur ; inconnu : 404', async () => {
      const ofB = await f.created(ROLLING, { aid: B.id, token: f.tokens.koffi });
      const ofA = await f.created(ROLLING);
      // Aminata n'est pas gestionnaire de B ; Koffi est owner de B mais viewer de A, Awa owner de A seulement.
      expect((await patch(ofB.id, { name: 'X' }, { token: f.tokens.aminata, aid: B.id })).status).toBe(404);
      expect((await patch(ofB.id, { name: 'X' })).status).toBe(404);
      expect((await patch(ofA.id, { name: 'X' }, { token: f.tokens.koffi, aid: B.id })).status).toBe(404);
      expect((await patch(ofA.id, { name: 'X' }, { token: f.tokens.moussa })).status).toBe(404);
      // Ni la version (412) ni l'état (409) d'un projet étranger ne se devinent.
      expect((await patch(ofB.id, { name: 'X' }, { version: 99 })).status).toBe(404);
      await f.h.superuser(`UPDATE projects SET status = 'completed' WHERE id = $1`, [ofB.id]);
      expect((await patch(ofB.id, { name: 'X' })).status).toBe(404);
      await f.h.superuser(`UPDATE projects SET status = 'draft' WHERE id = $1`, [ofB.id]);
      const unknown = await patch('00000000-0000-7000-8000-00000000c2ff', { name: 'X' });
      expect(unknown.status).toBe(404);
      expect(await codeOf(unknown)).toBe('not_found');
      const names = await f.h.superuser('SELECT name, version FROM projects ORDER BY created_at');
      expect(names.rows).toEqual([
        { name: ROLLING.name, version: 1 },
        { name: ROLLING.name, version: 1 },
      ]);
    });
  });
});
