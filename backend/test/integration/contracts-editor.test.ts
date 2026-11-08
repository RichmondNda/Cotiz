import { createHash } from 'node:crypto';
import { ENDPOINTS, Project } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf, PLANS } from './platform-associations.fixture.js';
import { type MembersFixture, PROJECTS, startMembersFixture } from './members.fixture.js';
import { FIXED } from './projects.fixture.js';

/**
 * Lot 4.1 · étape 2 : éditeur de contrat (ct.get : lecture, modification du modèle, signature de l'association et
 * verrouillage ; ct.list), contrat saisi à la création du projet (pr.create), inscription à un projet sous contrat
 * (en.create → `pending_signature`, sans échéance, `contract.signature_required`). Fonctionnalité `contracts` du plan
 * (`feature_disabled`), verrou optimiste (`If-Match`, `version_conflict`), modification réservée à `projects.manage`
 * (viewer : lecture seule), isolation (projet d'une autre association : 404). Vérification de l'étape :
 * `contract_locked` après verrouillage.
 */

const Contract = ENDPOINTS['ct.get'].operations.get.response.body;
const Contracts = ENDPOINTS['ct.list'].operations.list.response.body;
const Created = ENDPOINTS['en.create'].operations.create.response.body;

const TEMPLATE = 'Je soussigné(e) {nom_souscripteur} m’engage à verser {montant} à {association}.';
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe('éditeur de contrat (ct.get, ct.list)', () => {
  let f: MembersFixture;

  const url = (pid: string, aid = A.id) => `/associations/${aid}/projects/${pid}/contract`;
  const read = (pid: string, options: { aid?: string; token?: string } = {}) =>
    f.call(url(pid, options.aid), { token: options.token ?? f.tokens.awa });
  const contractOf = async (pid: string) => {
    const res = await read(pid);
    expect(res.status).toBe(200);
    return Contract.parse(await res.json());
  };
  const put = (pid: string, body: unknown, options: { version?: number; token?: string; aid?: string } = {}) =>
    f.call(url(pid, options.aid), {
      token: options.token ?? f.tokens.awa,
      method: 'PUT',
      body,
      headers: { 'if-match': `W/"${String(options.version ?? 1)}"` },
    });
  const lock = (pid: string, options: { version?: number; token?: string; aid?: string } = {}) =>
    f.call(`${url(pid, options.aid)}/lock`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      headers: { 'if-match': `W/"${String(options.version ?? 1)}"` },
    });
  const list = (options: { aid?: string; token?: string; query?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/contracts${options.query ?? ''}`, {
      token: options.token ?? f.tokens.awa,
    });
  const body = { bodyTemplate: TEMPLATE, signerName: 'Awa Koné', signerTitle: 'Présidente' };

  /** Contrat posé en base (hors API) ; `locked` : signé par Awa. */
  const insertContract = async (pid: string, options: { aid?: string; locked?: boolean; createdAt?: string } = {}) => {
    const id = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO contracts (id, association_id, project_id, body_template, template_sha256, association_signer_name,
                              association_signer_title, association_signed_by, association_signed_at, locked_at,
                              created_at)
       VALUES ($1, $2, $3, $4, $5, 'Awa Koné', 'Présidente', $6, $7, $7, coalesce($8::timestamptz, now()))`,
      [
        id,
        options.aid ?? A.id,
        pid,
        TEMPLATE,
        sha256(TEMPLATE),
        options.locked ? USERS.awa : null,
        options.locked ? '2026-11-01T09:00:00Z' : null,
        options.createdAt ?? null,
      ],
    );
    return id;
  };
  /** Inscription posée en base, `joined` jours plus tôt. */
  const enrollment = async (pid: string, userId: string, status: string, joined: number, aid = A.id) => {
    const id = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO enrollments (id, association_id, project_id, user_id, status, starts_from, joined_at)
       VALUES ($1, $2, $3, $4, $5, '2026-03-01', now() - make_interval(days => $6))`,
      [id, aid, pid, userId, status, joined],
    );
    return id;
  };
  /** Contre-signature (et son PDF) posée en base. */
  const signature = async (contractId: string, enrollmentId: string, userId: string, aid = A.id) => {
    const fileId = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                          size_bytes, scan_status)
       VALUES ($1::uuid, $2::uuid, $3, 'contract_pdf', 'cotiz-legal',
               $2::uuid::text || '/contract_pdf/' || $1::uuid::text || '.pdf',
               'contrat.pdf', 'application/pdf', 0, 'pending')`,
      [fileId, aid, userId],
    );
    await f.h.superuser(
      `INSERT INTO contract_signatures (id, association_id, contract_id, enrollment_id, user_id, rendered_sha256,
                                        rendered_body, consent_text, signed_at, pdf_file_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, repeat('c', 64), 'Contrat', 'J’ai lu et j’accepte', now(), $5)`,
      [aid, contractId, enrollmentId, userId, fileId],
    );
  };
  const events = async (type: string) =>
    (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, aggregate_id, payload FROM outbox_events WHERE event_type = $1
          ORDER BY id`,
        [type],
      )
    ).rows as { association_id: string; actor_user_id: string; aggregate_id: string; payload: unknown }[];
  const audits = async (action: string) =>
    (
      await f.h.superuser(
        `SELECT actor_user_id, association_id, entity_id, before, after FROM audit_logs
          WHERE action = $1 AND occurred_at >= $2 ORDER BY occurred_at`,
        [action, testStart],
      )
    ).rows as Record<string, unknown>[];
  const setPlanFeatures = (planId: string, features: string[]) =>
    f.h.superuser('UPDATE plans SET features = $2 WHERE id = $1', [planId, features]);
  const awa = async () =>
    (
      (
        await f.h.superuser('SELECT id, first_name AS "firstName", last_name AS "lastName" FROM users WHERE id = $1', [
          USERS.awa,
        ])
      ).rows as [{ id: string; firstName: string; lastName: string }]
    )[0];

  beforeAll(async () => {
    f = await startMembersFixture();
  });

  afterAll(() => f.stop());

  /** Début du test en cours (le journal d'audit est en ajout seul : il garde les tests précédents). */
  let testStart: Date;

  beforeEach(async () => {
    testStart = ((await f.h.superuser('SELECT clock_timestamp() AS t')).rows as [{ t: Date }])[0].t;
    await f.h.superuser(
      `BEGIN; SET LOCAL session_replication_role = replica;
       DELETE FROM contract_signatures; DELETE FROM files WHERE purpose = 'contract_pdf'; DELETE FROM contracts;
       DELETE FROM outbox_events WHERE event_type LIKE 'contract.%'; COMMIT;`,
    );
    await f.resetMembers();
    // Projets créés par pr.create pendant un test (les projets du jeu restent).
    await f.h.superuser(`DELETE FROM project_payment_methods WHERE NOT (project_id = ANY($1::uuid[]))`, [
      Object.values(PROJECTS),
    ]);
    await f.h.superuser(`DELETE FROM projects WHERE NOT (id = ANY($1::uuid[]))`, [Object.values(PROJECTS)]);
    // Projets du jeu : conditions de nouveau modifiables, nom d'origine.
    await f.h.superuser(
      `UPDATE projects SET financial_terms_locked_at = NULL, name = 'Centre communautaire' WHERE id = $1`,
      [PROJECTS.a],
    );
    await f.h.superuser(`UPDATE projects SET financial_terms_locked_at = NULL WHERE id = ANY($1::uuid[])`, [
      Object.values(PROJECTS),
    ]);
    // A (Essentiel) et B (Pro) : contrats compris dans le plan, sauf test contraire.
    await setPlanFeatures(PLANS.essentiel, ['contracts']);
    await setPlanFeatures(PLANS.pro, ['contracts']);
  });

  describe('lecture', () => {
    it('contrat du projet : modèle, empreinte, signataire, signatures ; ETag de la version', async () => {
      const contractId = await insertContract(PROJECTS.a);
      const res = await read(PROJECTS.a);
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBe('W/"1"');
      expect(Contract.parse(await res.json())).toEqual({
        id: contractId,
        projectId: PROJECTS.a,
        bodyTemplate: TEMPLATE,
        templateSha256: sha256(TEMPLATE),
        signer: { name: 'Awa Koné', title: 'Présidente' },
        associationSignedAt: null,
        associationSignedBy: null,
        lockedAt: null,
        signatures: { signed: 0, total: 0 },
        unsigned: [],
        pdfFileId: null,
        version: 1,
      });
    });

    it('signatures : signées = contre-signatures, total = signées + inscriptions en attente (ni retirées ni antérieures)', async () => {
      const contractId = await insertContract(PROJECTS.a, { locked: true });
      const signed = await enrollment(PROJECTS.a, USERS.fatou, 'active', 3);
      await signature(contractId, signed, USERS.fatou);
      const pending = await enrollment(PROJECTS.a, USERS.moussa, 'pending_signature', 2);
      await enrollment(PROJECTS.a, USERS.aminata, 'withdrawn', 4);
      // Inscription d'avant le contrat (active, sans signature) : ni signée ni à signer.
      await enrollment(PROJECTS.a, USERS.koffi, 'active', 9);
      const contract = await contractOf(PROJECTS.a);
      expect(contract.signatures).toEqual({ signed: 1, total: 2 });
      expect(contract.unsigned).toEqual([
        {
          enrollmentId: pending,
          member: { id: USERS.moussa, firstName: expect.any(String) as string, lastName: 'Diarra' },
          enrolledAt: expect.any(String) as string,
        },
      ]);
      expect(contract.lockedAt).toBe('2026-11-01T09:00:00.000Z');
      expect(contract.associationSignedBy).toEqual(await awa());
    });

    it('projet sans contrat, projet inconnu, projet d’une autre association : 404', async () => {
      await insertContract(PROJECTS.b, { aid: B.id });
      expect((await read(PROJECTS.a)).status).toBe(404);
      expect((await read(crypto.randomUUID())).status).toBe(404);
      const other = await read(PROJECTS.b);
      expect(other.status).toBe(404);
      expect(await codeOf(other)).toBe('not_found');
      expect((await put(PROJECTS.b, body)).status).toBe(404);
      expect((await lock(PROJECTS.b)).status).toBe(404);
    });

    it('RLS de contracts élargie : le code filtre seul par association (404, liste de A seulement)', async () => {
      await insertContract(PROJECTS.b, { aid: B.id });
      await f.h.withPolicy('contracts', 'tenant_isolation', { using: 'true', withCheck: 'true' }, async () => {
        expect((await read(PROJECTS.b)).status).toBe(404);
        expect((await put(PROJECTS.b, body)).status).toBe(404);
        expect((await lock(PROJECTS.b)).status).toBe(404);
        expect(Contracts.parse(await (await list()).json()).total).toBe(0);
      });
      // Contrat de B intact, toujours lu par B.
      expect((await read(PROJECTS.b, { aid: B.id, token: f.tokens.koffi })).status).toBe(200);
    });

    it('association B dans l’URL (non membre) ou jeton souscripteur : 404 sur chaque route, rien ne change', async () => {
      const contractId = await insertContract(PROJECTS.b, { aid: B.id });
      await insertContract(PROJECTS.a);
      for (const token of [f.tokens.awa, f.tokens.moussa]) {
        for (const res of [
          await read(PROJECTS.b, { aid: B.id, token }),
          await put(PROJECTS.b, body, { aid: B.id, token }),
          await lock(PROJECTS.b, { aid: B.id, token }),
          await list({ aid: B.id, token }),
        ]) {
          expect(res.status).toBe(404);
          expect(await codeOf(res)).toBe('not_found');
        }
      }
      for (const res of [
        await read(PROJECTS.a, { token: f.tokens.moussa }),
        await put(PROJECTS.a, body, { token: f.tokens.moussa }),
        await lock(PROJECTS.a, { token: f.tokens.moussa }),
        await list({ token: f.tokens.moussa }),
      ]) {
        expect(res.status).toBe(404);
      }
      const rows = (await f.h.superuser('SELECT version, locked_at FROM contracts WHERE id = $1', [contractId]))
        .rows as [{ version: number; locked_at: Date | null }];
      expect(rows[0]).toEqual({ version: 1, locked_at: null });
    });

    it('viewer : lecture permise', async () => {
      await insertContract(PROJECTS.a);
      expect((await read(PROJECTS.a, { token: f.tokens.koffi })).status).toBe(200);
    });
  });

  describe('modification du modèle (PUT)', () => {
    it('modèle et signataire remplacés, empreinte recalculée, version suivante ; audité', async () => {
      const contractId = await insertContract(PROJECTS.a);
      const template = `${TEMPLATE} Fréquence : {frequence}.`;
      const res = await put(PROJECTS.a, {
        bodyTemplate: template,
        signerName: 'Aminata Bamba',
        signerTitle: 'Trésorière',
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBe('W/"2"');
      const contract = Contract.parse(await res.json());
      expect(contract).toMatchObject({
        id: contractId,
        bodyTemplate: template,
        templateSha256: sha256(template),
        signer: { name: 'Aminata Bamba', title: 'Trésorière' },
        lockedAt: null,
        version: 2,
      });
      expect(await audits('contract.update')).toEqual([
        {
          actor_user_id: USERS.awa,
          association_id: A.id,
          entity_id: contractId,
          before: { bodyTemplate: TEMPLATE, signerName: 'Awa Koné', signerTitle: 'Présidente' },
          after: { bodyTemplate: template, signerName: 'Aminata Bamba', signerTitle: 'Trésorière' },
        },
      ]);
    });

    it('version périmée : 412 version_conflict, rien ne change', async () => {
      await insertContract(PROJECTS.a);
      const res = await put(PROJECTS.a, { ...body, bodyTemplate: 'Autre' }, { version: 3 });
      expect(res.status).toBe(412);
      expect(await codeOf(res)).toBe('version_conflict');
      expect((await contractOf(PROJECTS.a)).bodyTemplate).toBe(TEMPLATE);
    });

    it('corps invalide : 422', async () => {
      await insertContract(PROJECTS.a);
      expect((await put(PROJECTS.a, { ...body, bodyTemplate: '' })).status).toBe(422);
    });

    it('viewer : 403 forbidden ; manager : permis', async () => {
      await insertContract(PROJECTS.a);
      const viewer = await put(PROJECTS.a, body, { token: f.tokens.koffi });
      expect(viewer.status).toBe(403);
      expect(await codeOf(viewer)).toBe('forbidden');
      expect((await put(PROJECTS.a, body, { token: f.tokens.aminata })).status).toBe(200);
    });

    it('projet sans contrat : 404 (le contrat se crée avec le projet)', async () => {
      expect((await put(PROJECTS.a, body)).status).toBe(404);
    });
  });

  describe('signature de l’association et verrouillage', () => {
    const termsLockedAt = async (pid: string) =>
      (
        (await f.h.superuser('SELECT financial_terms_locked_at::text AS t FROM projects WHERE id = $1', [pid]))
          .rows as [{ t: string | null }]
      )[0].t;

    it('lock fige les conditions financières du projet (domain-rules § 9) : montant refusé, nom permis', async () => {
      await insertContract(PROJECTS.a);
      expect(await termsLockedAt(PROJECTS.a)).toBeNull();
      expect((await lock(PROJECTS.a)).status).toBe(200);
      expect(await termsLockedAt(PROJECTS.a)).not.toBeNull();
      const version = (
        (await f.h.superuser('SELECT version FROM projects WHERE id = $1', [PROJECTS.a])).rows as [{ version: number }]
      )[0].version;
      const patch = (patchBody: unknown) =>
        f.call(`/associations/${A.id}/projects/${PROJECTS.a}`, {
          token: f.tokens.awa,
          method: 'PATCH',
          body: patchBody,
          headers: { 'if-match': `W/"${String(version)}"` },
        });
      const amount = await patch({ installmentAmount: { amount: 30000, currency: 'XOF' } });
      expect(amount.status).toBe(409);
      expect(await codeOf(amount)).toBe('financial_terms_locked');
      expect((await patch({ name: 'Centre de Yopougon' })).status).toBe(200);
    });

    it('conditions déjà figées par un paiement validé : date d’origine gardée', async () => {
      await insertContract(PROJECTS.a);
      await f.h.superuser(`UPDATE projects SET financial_terms_locked_at = '2026-09-01T10:00:00Z' WHERE id = $1`, [
        PROJECTS.a,
      ]);
      expect((await lock(PROJECTS.a)).status).toBe(200);
      expect(await termsLockedAt(PROJECTS.a)).toBe('2026-09-01 10:00:00+00');
    });

    it('lock : signé par la personne connectée, verrouillé, contract.locked ; audité', async () => {
      const contractId = await insertContract(PROJECTS.a);
      const res = await lock(PROJECTS.a, { token: f.tokens.awa });
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBe('W/"2"');
      const contract = Contract.parse(await res.json());
      expect(contract.lockedAt).not.toBeNull();
      expect(contract.associationSignedAt).toBe(contract.lockedAt);
      expect(contract.associationSignedBy).toEqual(await awa());
      expect(contract.templateSha256).toBe(sha256(TEMPLATE));
      expect(await events('contract.locked')).toEqual([
        {
          association_id: A.id,
          actor_user_id: USERS.awa,
          aggregate_id: contractId,
          payload: { contractId, projectId: PROJECTS.a },
        },
      ]);
      expect(await audits('contract.lock')).toMatchObject([
        { actor_user_id: USERS.awa, association_id: A.id, entity_id: contractId },
      ]);
    });

    it('vérification de l’étape : après verrouillage, modification et second verrouillage → 409 contract_locked', async () => {
      await insertContract(PROJECTS.a);
      expect((await lock(PROJECTS.a)).status).toBe(200);
      const edit = await put(PROJECTS.a, { ...body, bodyTemplate: 'Autre texte' }, { version: 2 });
      expect(edit.status).toBe(409);
      expect(await codeOf(edit)).toBe('contract_locked');
      const again = await lock(PROJECTS.a, { version: 2 });
      expect(again.status).toBe(409);
      expect(await codeOf(again)).toBe('contract_locked');
      const contract = await contractOf(PROJECTS.a);
      expect(contract).toMatchObject({ bodyTemplate: TEMPLATE, version: 2 });
      expect(await events('contract.locked')).toHaveLength(1);
    });

    it('version périmée : 412 ; viewer : 403', async () => {
      await insertContract(PROJECTS.a);
      expect((await lock(PROJECTS.a, { version: 5 })).status).toBe(412);
      expect((await lock(PROJECTS.a, { token: f.tokens.koffi })).status).toBe(403);
      expect((await contractOf(PROJECTS.a)).lockedAt).toBeNull();
    });
  });

  describe('liste des contrats (ct.list)', () => {
    it('contrats de l’association, le plus récent d’abord, avec l’état des signatures', async () => {
      const older = await insertContract(PROJECTS.a, { locked: true, createdAt: '2026-10-01T08:00:00Z' });
      await insertContract(PROJECTS.a2);
      await insertContract(PROJECTS.b, { aid: B.id });
      const signedEnrollment = await enrollment(PROJECTS.a, USERS.fatou, 'active', 3);
      await signature(older, signedEnrollment, USERS.fatou);
      await enrollment(PROJECTS.a, USERS.moussa, 'pending_signature', 10);
      await enrollment(PROJECTS.a, USERS.aminata, 'pending_signature', 2);

      const res = await list();
      expect(res.status).toBe(200);
      const page = Contracts.parse(await res.json());
      expect(page.total).toBe(2);
      expect(page.nextCursor).toBeNull();
      expect(page.items.map((c) => c.project)).toEqual([
        { id: PROJECTS.a2, name: 'Cotisation annuelle' },
        { id: PROJECTS.a, name: 'Centre communautaire' },
      ]);
      expect(page.items[1]).toMatchObject({
        createdAt: '2026-10-01T08:00:00.000Z',
        lockedAt: '2026-11-01T09:00:00.000Z',
        signed: 1,
        total: 3,
        unsignedOver7Days: 1,
      });
      expect(page.items[0]).toMatchObject({ lockedAt: null, signed: 0, total: 0, unsignedOver7Days: 0 });
    });

    it('pages par curseur', async () => {
      await insertContract(PROJECTS.a);
      await insertContract(PROJECTS.a2);
      await insertContract(PROJECTS.rollingA);
      const first = Contracts.parse(await (await list({ query: '?limit=2' })).json());
      expect(first.items).toHaveLength(2);
      expect(first.total).toBe(3);
      expect(first.nextCursor).not.toBeNull();
      const second = Contracts.parse(
        await (await list({ query: `?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}` })).json(),
      );
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      const ids = [...first.items, ...second.items].map((c) => c.project.id);
      expect(new Set(ids)).toEqual(new Set([PROJECTS.a, PROJECTS.a2, PROJECTS.rollingA]));
    });

    it('aucun contrat : liste vide', async () => {
      const page = Contracts.parse(await (await list()).json());
      expect(page).toEqual({ items: [], nextCursor: null, total: 0 });
    });
  });

  describe('fonctionnalité du plan', () => {
    it('plan sans contrats : 403 feature_disabled sur ct.get, ct.list et pr.create avec contrat', async () => {
      await insertContract(PROJECTS.a);
      await setPlanFeatures(PLANS.essentiel, []);
      for (const res of [
        await read(PROJECTS.a),
        await put(PROJECTS.a, body),
        await lock(PROJECTS.a),
        await list(),
        await f.create({ ...FIXED, contract: { ...body, signNow: false } }),
      ]) {
        expect(res.status).toBe(403);
        expect(await codeOf(res)).toBe('feature_disabled');
      }
      // Sans contrat, le projet se crée.
      expect((await f.create(FIXED)).status).toBe(201);
      // L'autre association garde la sienne.
      await insertContract(PROJECTS.b, { aid: B.id });
      expect((await read(PROJECTS.b, { aid: B.id, token: f.tokens.koffi })).status).toBe(200);
    });
  });

  describe('contrat saisi à la création du projet (pr.create)', () => {
    it('sans signature : contrat modifiable, version 1', async () => {
      const project = await f.created({ ...FIXED, contract: { ...body, signNow: false } });
      expect(project.financialTermsLockedAt).toBeNull();
      const contract = await contractOf(project.id);
      expect(contract).toMatchObject({
        projectId: project.id,
        bodyTemplate: TEMPLATE,
        templateSha256: sha256(TEMPLATE),
        signer: { name: 'Awa Koné', title: 'Présidente' },
        lockedAt: null,
        associationSignedBy: null,
        version: 1,
      });
      expect(await events('contract.locked')).toEqual([]);
    });

    it('« je signe » : contrat signé par la personne connectée et verrouillé, contract.locked', async () => {
      const project = Project.parse(
        await (await f.create({ ...FIXED, contract: { ...body, signNow: true } }, { token: f.tokens.aminata })).json(),
      );
      // Contrat verrouillé : conditions financières figées dès la création.
      expect(project.financialTermsLockedAt).not.toBeNull();
      const contract = await contractOf(project.id);
      expect(contract.lockedAt).not.toBeNull();
      expect(contract.associationSignedAt).toBe(contract.lockedAt);
      expect(contract.associationSignedBy?.id).toBe(USERS.aminata);
      expect(await events('contract.locked')).toEqual([
        {
          association_id: A.id,
          actor_user_id: USERS.aminata,
          aggregate_id: contract.id,
          payload: { contractId: contract.id, projectId: project.id },
        },
      ]);
    });

    it('contrat invalide : 422, aucun projet', async () => {
      const res = await f.create({ ...FIXED, contract: { ...body, bodyTemplate: '', signNow: false } });
      expect(res.status).toBe(422);
      // Hors projets du jeu (PROJECTS.a porte le même nom).
      const rows = (
        await f.h.superuser(`SELECT count(*)::int AS n FROM projects WHERE NOT (id = ANY($1::uuid[]))`, [
          Object.values(PROJECTS),
        ])
      ).rows as [{ n: number }];
      expect(rows[0].n).toBe(0);
    });
  });

  describe('inscription à un projet sous contrat (en.create)', () => {
    const enroll = (pid: string, key: string = crypto.randomUUID()) =>
      f.call(`/associations/${A.id}/projects/${pid}/enrollments`, {
        token: f.tokens.awa,
        method: 'POST',
        body: { userId: USERS.moussa },
        headers: { 'idempotency-key': key },
      });
    const installmentsCount = async (enrollmentId: string) =>
      (
        (await f.h.superuser('SELECT count(*)::int AS n FROM installments WHERE enrollment_id = $1', [enrollmentId]))
          .rows as [{ n: number }]
      )[0].n;

    it('contrat : inscription en attente de signature, sans échéance, contract.signature_required', async () => {
      await insertContract(PROJECTS.a, { locked: true });
      const res = await enroll(PROJECTS.a);
      expect(res.status).toBe(201);
      const { enrollment } = Created.parse(await res.json());
      expect(enrollment.status).toBe('pending_signature');
      const rows = (
        await f.h.superuser(
          `SELECT e.status, e.activated_at, (SELECT count(*)::int FROM installments i WHERE i.enrollment_id = e.id) AS n
             FROM enrollments e WHERE e.id = $1`,
          [enrollment.id],
        )
      ).rows as [{ status: string; activated_at: Date | null; n: number }];
      expect(rows[0]).toEqual({ status: 'pending_signature', activated_at: null, n: 0 });
      expect(await events('contract.signature_required')).toEqual([
        {
          association_id: A.id,
          actor_user_id: USERS.awa,
          aggregate_id: enrollment.id,
          payload: { enrollmentId: enrollment.id, userId: USERS.moussa, projectId: PROJECTS.a },
        },
      ]);
      expect((await contractOf(PROJECTS.a)).signatures).toEqual({ signed: 0, total: 1 });
      // Montants : rien de payé ni en retard ; reste = engagement prévu (échéancier calculé, pas encore écrit).
      expect(enrollment.paid.amount).toBe(0);
      expect(enrollment.lateAmount.amount).toBe(0);
      expect(enrollment.commitment?.amount).toBeGreaterThan(0);
      expect(enrollment.remaining).toEqual(enrollment.commitment);
    });

    it('rejeu de la même requête (Idempotency-Key) : même réponse, un seul événement, aucune échéance', async () => {
      await insertContract(PROJECTS.a, { locked: true });
      const key = crypto.randomUUID();
      const first = await enroll(PROJECTS.a, key);
      expect(first.status).toBe(201);
      const firstBody = Created.parse(await first.json());
      const again = await enroll(PROJECTS.a, key);
      expect(again.status).toBe(201);
      expect(Created.parse(await again.json())).toEqual(firstBody);
      expect(await events('contract.signature_required')).toHaveLength(1);
      expect(await events('member.enrolled')).toHaveLength(1);
      expect(await installmentsCount(firstBody.enrollment.id)).toBe(0);
    });

    it('cycle roulant sous contrat : en attente, sans échéance ni engagement', async () => {
      await insertContract(PROJECTS.rollingA);
      const { enrollment } = Created.parse(await (await enroll(PROJECTS.rollingA)).json());
      expect(enrollment.status).toBe('pending_signature');
      expect(enrollment.commitment).toBeNull();
      expect(await installmentsCount(enrollment.id)).toBe(0);
    });

    it('contrat pas encore verrouillé : en attente de signature aussi', async () => {
      await insertContract(PROJECTS.a);
      const { enrollment } = Created.parse(await (await enroll(PROJECTS.a)).json());
      expect(enrollment.status).toBe('pending_signature');
    });

    it('sans contrat : inscription active avec son échéancier, aucun événement de contrat', async () => {
      await insertContract(PROJECTS.a2);
      const { enrollment } = Created.parse(await (await enroll(PROJECTS.a)).json());
      expect(enrollment.status).toBe('active');
      const rows = (await f.h.superuser('SELECT activated_at FROM enrollments WHERE id = $1', [enrollment.id]))
        .rows as [{ activated_at: Date | null }];
      expect(rows[0].activated_at).not.toBeNull();
      expect(await installmentsCount(enrollment.id)).toBeGreaterThan(0);
      expect(await events('contract.signature_required')).toEqual([]);
    });
  });
});
