import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ImportJobsConsumer } from '../../src/modules/imports/events/import-jobs.consumer.js';
import { NotificationsConsumer } from '../../src/modules/notifications/events/notifications.consumer.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type ImportsFixture, Job, startImportsFixture } from './imports.fixture.js';
import { PHONES, PROJECTS } from './members.fixture.js';
import { PLANS } from './platform-associations.fixture.js';

/**
 * Lot 4.4 · étape 4 : envoi (im.commit, 202) puis exécution dans le worker, ligne par ligne par le cas d'usage
 * d'inscription unitaire (même résultat qu'en.create), progression, reprise sans doublon, `import.completed`,
 * notification du gestionnaire, codes des nouveaux comptes dans « Codes à remettre ».
 */

const Codes = ENDPOINTS['mb.codes'].operations.list.response.body;

const FILE = [
  'Prénom;Nom;Téléphone;Email;Quartier',
  'Aïcha;Bamba;0712345678;aicha@exemple.ci;Yopougon', // 2 : nouveau compte
  'Moussa;Diallo;05 44 21 87 90;;Cocody', // 3 : compte existant (Moussa)
  'Yao;Kouamé;0501020304;;Abobo', // 4 : nouveau compte
  ';Coulibaly;0102030405;;Abobo', // 5 : erreur (prénom), non envoyée
].join('\n');

describe('imports : envoi et exécution (im.commit, worker)', () => {
  let f: ImportsFixture;

  const commit = (id: string, options: { token?: string; aid?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/imports/${id}/commit`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
  const problem = async (res: Response) => ({
    status: res.status,
    code: ((await res.json()) as { code?: string }).code,
  });
  const count = async (query: string, params: unknown[] = []) =>
    ((await f.h.superuser(query, params)).rows as [{ n: number }])[0].n;
  const userOf = async (phone: string) =>
    ((await f.h.superuser('SELECT id FROM users WHERE phone_e164 = $1', [phone])).rows as { id: string }[])[0]?.id;

  /** Trace d'une inscription, sans identifiants ni dates : compte, profil, appartenance, échéances, événement, audit. */
  const footprint = async (userId: string, projectId: string) => {
    const one = async (query: string): Promise<unknown[]> =>
      (await f.h.superuser(query, [userId, projectId])).rows as unknown[];
    return {
      user: await one(`SELECT first_name, last_name, email, status FROM users WHERE id = $1 AND $2::uuid IS NOT NULL`),
      profile: await one(
        `SELECT address, created_by_association_id FROM subscriber_profiles WHERE user_id = $1 AND $2::uuid IS NOT NULL`,
      ),
      membership: await one(
        `SELECT association_id, role, status FROM memberships WHERE user_id = $1 AND $2::uuid IS NOT NULL`,
      ),
      enrollment: await one(
        `SELECT association_id, status, starts_from FROM enrollments WHERE user_id = $1 AND project_id = $2`,
      ),
      installments: await one(
        `SELECT kind, sequence, due_date, amount_due, amount_paid, status, late_since FROM installments
          WHERE user_id = $1 AND project_id = $2 ORDER BY kind, sequence`,
      ),
      codes: await one(
        `SELECT purpose, association_id FROM one_time_codes WHERE user_id = $1 AND $2::uuid IS NOT NULL`,
      ),
      events: await one(
        `SELECT event_type, actor_user_id, payload - 'enrollmentId' - 'userId' AS payload FROM outbox_events
          WHERE event_type = 'member.enrolled' AND payload->>'userId' = $1::text AND payload->>'projectId' = $2::text`,
      ),
      audits: await one(
        `SELECT actor_user_id, actor_role, association_id, entity_type FROM audit_logs
          WHERE action = 'enrollment.create' AND after->>'userId' = $1::text AND $2::uuid IS NOT NULL`,
      ),
    };
  };

  /** Import de FILE dans ce projet, classé, envoyé (202, `importing`). */
  const committed = async (projectId = PROJECTS.a, content = FILE) => {
    const { id } = await f.analyzed(projectId, content);
    const res = await commit(id);
    expect(res.status).toBe(202);
    return Job.parse(await res.json());
  };

  beforeAll(async () => {
    f = await startImportsFixture();
  });

  afterAll(async () => {
    await f.stop();
  });

  beforeEach(async () => {
    await f.resetImports();
  });

  // Rétablit ce que certains tests changent : appartenance d'Awa, statut du projet, numéro de Moussa.
  afterEach(async () => {
    await f.h.superuser(
      `UPDATE memberships SET status = 'active', removed_at = NULL
        WHERE user_id = $1 AND association_id = $2 AND role IN ('owner', 'manager')`,
      [USERS.awa, A.id],
    );
    await f.h.superuser(`UPDATE projects SET status = 'enrolling' WHERE id = $1`, [PROJECTS.a]);
    await f.resetMembers();
    await f.h.superuser('UPDATE users SET phone_e164 = $2 WHERE id = $1', [USERS.moussa, PHONES.moussa]);
  });

  it('202 `importing`, `import.commit_requested`, audit ; exécution : `completed`, bilan, `import.completed`', async () => {
    const { id } = await f.analyzed(PROJECTS.a, FILE);
    const res = await commit(id);
    expect(res.status).toBe(202);
    const job = Job.parse(await res.json());
    expect(job).toMatchObject({
      status: 'importing',
      progress: { total: 3, processed: 0, enrolled: 0, attached: 0, failed: 0 },
    });
    expect((await f.events(id)).at(-1)).toEqual({
      type: 'import.commit_requested',
      payload: { importId: id, requestedBy: USERS.awa },
    });
    expect(
      (await f.h.superuser(`SELECT actor_user_id, after FROM audit_logs WHERE action = 'import.commit'`)).rows,
    ).toEqual([{ actor_user_id: USERS.awa, after: { status: 'importing', projectId: PROJECTS.a, rows: 3 } }]);

    await f.execute(id);
    const done = await f.get(id);
    expect(done).toMatchObject({
      status: 'completed',
      progress: { total: 3, processed: 3, enrolled: 2, attached: 1, failed: 0 },
      counts: { ready: 2, existing: 1, error: 1 },
    });
    expect((await f.events(id)).at(-1)).toEqual({
      type: 'import.completed',
      payload: { importId: id, counts: { total: 3, processed: 3, enrolled: 2, attached: 1, failed: 0 } },
    });
    expect(await count('SELECT count(*)::int AS n FROM enrollments WHERE project_id = $1', [PROJECTS.a])).toBe(3);
    // La ligne en erreur n'est pas envoyée ; rejouée, l'exécution ne fait rien de plus.
    await f.execute(id);
    expect(await count('SELECT count(*)::int AS n FROM enrollments WHERE project_id = $1', [PROJECTS.a])).toBe(3);
    expect((await f.events(id)).filter((e) => e.type === 'import.completed')).toHaveLength(1);
  });

  it('même résultat qu’une saisie unitaire (en.create) : compte, profil, appartenance, échéances, code, événement, audit', async () => {
    const one = 'Prénom;Nom;Téléphone;Email;Quartier\nAïcha;Bamba;0712345678;aicha@exemple.ci;Yopougon';
    const { id } = await committed(PROJECTS.a, one);
    await f.execute(id);
    const imported = await userOf('+2250712345678');

    const res = await f.call(`/associations/${A.id}/projects/${PROJECTS.a}/enrollments`, {
      token: f.tokens.awa,
      method: 'POST',
      body: {
        phone: '+2250799887766',
        firstName: 'Aïcha',
        lastName: 'Bamba',
        email: 'aicha2@exemple.ci',
        address: 'Yopougon',
      },
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(res.status).toBe(201);
    const typed = await userOf('+2250799887766');
    if (!imported || !typed) throw new Error('comptes absents');

    const a = await footprint(imported, PROJECTS.a);
    const b = await footprint(typed, PROJECTS.a);
    expect(a.installments.length).toBeGreaterThan(0);
    expect(a.codes).toHaveLength(1);
    expect(a.audits).toHaveLength(1);
    expect(a.user).toEqual([
      { first_name: 'Aïcha', last_name: 'Bamba', email: 'aicha@exemple.ci', status: 'pending_activation' },
    ]);
    expect({ ...a, user: [] }).toEqual({ ...b, user: [] });
  });

  it('compte existant rattaché par son téléphone ; les noms du fichier ne le modifient pas', async () => {
    const before = (await f.h.superuser('SELECT first_name, last_name FROM users WHERE id = $1', [USERS.moussa])).rows;
    const { id } = await committed();
    await f.execute(id);
    expect(
      await count('SELECT count(*)::int AS n FROM enrollments WHERE project_id = $1 AND user_id = $2', [
        PROJECTS.a,
        USERS.moussa,
      ]),
    ).toBe(1);
    expect((await f.h.superuser('SELECT first_name, last_name FROM users WHERE id = $1', [USERS.moussa])).rows).toEqual(
      before,
    );
    const row = (await f.rows(id)).items.find((r) => r.rowNumber === 3);
    expect(row).toMatchObject({ category: 'existing', existingUserId: USERS.moussa });
  });

  it('téléphone changé entre le classement et l’envoi : inscription par le téléphone du fichier, jamais par le compte vu', async () => {
    const { id } = await committed();
    // Le compte vu au classement (Moussa) change de numéro : son ancien numéro ne désigne plus personne.
    await f.h.superuser('UPDATE users SET phone_e164 = $2 WHERE id = $1', [USERS.moussa, PHONES.unknown]);
    await f.execute(id);
    expect(
      await count('SELECT count(*)::int AS n FROM enrollments WHERE project_id = $1 AND user_id = $2', [
        PROJECTS.a,
        USERS.moussa,
      ]),
    ).toBe(0);
    const fresh = await userOf(PHONES.moussa);
    expect(fresh).toBeDefined();
    expect(fresh).not.toBe(USERS.moussa);
    expect((await f.get(id)).progress).toMatchObject({ enrolled: 3, attached: 0 });
  });

  it('ligne refusée à l’exécution (inscrite entre-temps) : `error` avec le code d’en.create, les autres inscrites', async () => {
    const { id } = await committed();
    await f.enroll(PROJECTS.a, USERS.moussa);
    await f.execute(id);
    expect((await f.get(id)).progress).toEqual({ total: 3, processed: 3, enrolled: 2, attached: 0, failed: 1 });
    const row = (await f.rows(id)).items.find((r) => r.rowNumber === 3);
    expect(row).toMatchObject({ category: 'error', errors: [{ field: null, code: 'already_enrolled' }] });
  });

  it('reprise après interruption : aucune ligne inscrite deux fois, progression comptée en base', async () => {
    const { id } = await committed();
    // Panne de la base à la ligne 4 (Yao) : l'exécution s'arrête, les lignes 2 et 3 ont leur résultat.
    await f.h.superuser(`
      CREATE FUNCTION test_import_panne() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (SELECT phone_e164 FROM users WHERE id = NEW.user_id) = '+2250501020304' THEN
          RAISE EXCEPTION 'panne simulée';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER test_import_panne BEFORE INSERT ON enrollments
        FOR EACH ROW EXECUTE FUNCTION test_import_panne();`);
    await expect(f.execute(id)).rejects.toThrow();
    expect(await count('SELECT count(*)::int AS n FROM enrollments WHERE project_id = $1', [PROJECTS.a])).toBe(2);
    expect((await f.get(id)).status).toBe('importing');

    await f.h.superuser('DROP TRIGGER test_import_panne ON enrollments; DROP FUNCTION test_import_panne();');
    await f.execute(id);
    expect(await count('SELECT count(*)::int AS n FROM enrollments WHERE project_id = $1', [PROJECTS.a])).toBe(3);
    expect(await f.get(id)).toMatchObject({
      status: 'completed',
      progress: { total: 3, processed: 3, enrolled: 2, attached: 1, failed: 0 },
    });
  });

  it('demandeur retiré de l’association avant l’exécution : `failed` `requester_removed`, rien d’inscrit', async () => {
    const { id } = await committed();
    await f.h.superuser(
      `UPDATE memberships SET status = 'removed', removed_at = now()
        WHERE user_id = $1 AND association_id = $2 AND role IN ('owner', 'manager')`,
      [USERS.awa, A.id],
    );
    await f.execute(id);
    const { rows } = await f.h.superuser('SELECT status, counts FROM import_jobs WHERE id = $1', [id]);
    expect(rows[0] as unknown).toMatchObject({ status: 'failed', counts: { failure: 'requester_removed' } });
    expect(await count('SELECT count(*)::int AS n FROM enrollments WHERE project_id = $1', [PROJECTS.a])).toBe(0);
    expect((await f.events(id)).at(-1)).toEqual({
      type: 'import.failed',
      payload: { importId: id, error: 'requester_removed' },
    });
  });

  it('job d’une autre association (B) sur l’import de A : aucun effet, aucun événement', async () => {
    const { id } = await committed();
    await f.execute(id, USERS.koffi, B.id);
    expect((await f.get(id)).status).toBe('importing');
    expect(await count('SELECT count(*)::int AS n FROM enrollments WHERE project_id = $1', [PROJECTS.a])).toBe(0);
    expect((await f.events(id)).at(-1)?.type).toBe('import.commit_requested');
  });

  describe('refus de im.commit', () => {
    it('import pas encore classé, déjà envoyé : 409 `invalid_state`', async () => {
      const { id } = await f.analyzed(PROJECTS.a, FILE);
      await f.h.superuser(`UPDATE import_jobs SET status = 'mapped' WHERE id = $1`, [id]);
      expect(await problem(await commit(id))).toEqual({ status: 409, code: 'invalid_state' });
      await f.h.superuser(`UPDATE import_jobs SET status = 'validated' WHERE id = $1`, [id]);
      expect((await commit(id)).status).toBe(202);
      expect(await problem(await commit(id))).toEqual({ status: 409, code: 'invalid_state' });
    });

    it('aucune ligne à inscrire : 409 `invalid_state`', async () => {
      const { id } = await f.analyzed(PROJECTS.a, 'Prénom;Nom;Tel\n;Bamba;0712345678');
      expect(await problem(await commit(id))).toEqual({ status: 409, code: 'invalid_state' });
    });

    it('projet terminé : 409 `invalid_state`', async () => {
      const { id } = await f.analyzed(PROJECTS.a, FILE);
      await f.h.superuser(`UPDATE projects SET status = 'completed' WHERE id = $1`, [PROJECTS.a]);
      expect(await problem(await commit(id))).toEqual({ status: 409, code: 'invalid_state' });
      expect((await f.get(id)).status).toBe('validated');
    });

    it('places insuffisantes pour les nouveaux souscripteurs : 409 `quota_exceeded`, rien envoyé', async () => {
      const subscribers = (where: string) =>
        count(
          `SELECT count(*)::int AS n FROM memberships
            WHERE association_id = $1 AND role = 'subscriber' AND status <> 'removed' ${where}`,
          [A.id, USERS.moussa],
        );
      const used = await subscribers('AND $2::uuid IS NOT NULL');
      // Places demandées : les 3 lignes, moins Moussa s'il compte déjà parmi les souscripteurs de A.
      const needed = 3 - (await subscribers('AND user_id = $2'));
      const { id } = await f.analyzed(PROJECTS.a, FILE);
      await f.h.superuser('UPDATE plans SET max_subscribers = $2 WHERE id = $1', [PLANS.essentiel, used + needed - 1]);
      expect(await problem(await commit(id))).toEqual({ status: 409, code: 'quota_exceeded' });
      expect((await f.get(id)).status).toBe('validated');
      await f.h.superuser('UPDATE plans SET max_subscribers = $2 WHERE id = $1', [PLANS.essentiel, used + needed]);
      expect((await commit(id)).status).toBe(202);
    });
  });

  /** Événement écrit par l'outbox pour cet import, tel que le relais le remet (relais coupé dans ce jeu). */
  const envelopeOf = async (type: 'import.commit_requested' | 'import.completed', id: string) => {
    const [row] = (
      await f.h.superuser(
        `SELECT id::text, occurred_at, payload, actor_user_id FROM outbox_events
          WHERE event_type = $2 AND aggregate_id = $1`,
        [id, type],
      )
    ).rows as { id: string; occurred_at: Date; payload: Record<string, unknown>; actor_user_id: string | null }[];
    if (!row) throw new Error(`${type} absent`);
    return {
      id: row.id,
      type,
      version: 1,
      occurredAt: row.occurred_at.toISOString(),
      associationId: A.id,
      actorUserId: row.actor_user_id,
      aggregate: { type: 'import', id },
      payload: row.payload,
    };
  };

  it('chaîne réelle : `import.commit_requested` → file `imports` → `completed` ; gestionnaire notifié ; codes à remettre', async () => {
    const { id } = await committed();
    await f.worker.get(ImportJobsConsumer).handle(await envelopeOf('import.commit_requested', id));
    for (let i = 0; i < 150 && (await f.get(id)).status !== 'completed'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect((await f.get(id)).status).toBe('completed');

    await f.worker.get(NotificationsConsumer).handle(await envelopeOf('import.completed', id));
    expect(
      (
        await f.h.superuser(
          `SELECT user_id, title, body, action_url FROM notifications WHERE type = 'import.completed'`,
        )
      ).rows,
    ).toEqual([
      {
        user_id: USERS.awa,
        title: 'Import terminé',
        body: '3 souscripteurs inscrits au projet Centre communautaire, dont 1 déjà connu.',
        action_url: `/asso/projets/${PROJECTS.a}/import`,
      },
    ]);

    const res = await f.call(`/associations/${A.id}/activation-codes`, { token: f.tokens.awa });
    expect(res.status).toBe(200);
    const phones = Codes.parse(await res.json()).items.map((c) => c.member.phone);
    expect(phones).toEqual(expect.arrayContaining(['+2250712345678', '+2250501020304']));
    expect(phones).not.toContain(PHONES.moussa);
  });
});
