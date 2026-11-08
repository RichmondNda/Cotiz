import { createHash } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ENDPOINTS, type EventEnvelope, type EventType } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { ContractScheduleConsumer } from '../../src/modules/members/events/contract-schedule.consumer.js';
import { NotificationsConsumer } from '../../src/modules/notifications/events/notifications.consumer.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf, PLANS } from './platform-associations.fixture.js';
import { type MembersFixture, PROJECTS, startMembersFixture } from './members.fixture.js';

/**
 * Lot 4.1 · étape 3 : signature du souscripteur. me.contract (texte personnalisé, empreinte SHA-256, engagement),
 * me.sign (empreinte comparée : `contract_changed`, vérification de l'étape ; consentement ; une signature par
 * inscription : `already_signed`, aussi en concurrence ; preuve : IP, navigateur, texte de consentement, PDF à produire),
 * inscription `active`, `contract.signed` ; échéancier généré par le consommateur système (décision 20), rejouable ;
 * notifications des trois événements de contrat. Isolation : seulement ses propres inscriptions (404 sinon).
 */

const Contract = ENDPOINTS['me.contract'].operations.get.response.body;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const NNBSP = '\u202f';
const NBSP = '\u00a0';

const TEMPLATE =
  'Je soussigné(e) {nom_souscripteur} ({telephone}) m’engage envers {association} à verser {montant} pour {projet}, ' +
  'soit {nb_echeances} échéances {frequence} de {montant_echeance} le {jour}, à partir du {date_debut}.';
const CONSENT =
  'J’ai lu le contrat et je l’accepte. Je reconnais que ma signature électronique a la même valeur qu’une signature ' +
  'manuscrite.';

describe('signature du contrat (me.contract, me.sign)', () => {
  let f: MembersFixture;
  let worker: INestApplicationContext;
  let associationAName: string;
  let moussaFirstName: string;
  /** Début du test en cours (journal d'audit en ajout seul). */
  let testStart: Date;

  const read = (pid: string, token = f.tokens.moussa) => f.call(`/me/projects/${pid}/contract`, { token });
  const contractOf = async (pid: string) => {
    const res = await read(pid);
    expect(res.status).toBe(200);
    return Contract.parse(await res.json());
  };
  const sign = (pid: string, renderedSha256: string, options: { key?: string; token?: string } = {}) =>
    f.call(`/me/projects/${pid}/contract/sign`, {
      token: options.token ?? f.tokens.moussa,
      method: 'POST',
      body: { renderedSha256, accepted: true },
      headers: { 'idempotency-key': options.key ?? crypto.randomUUID(), 'user-agent': 'Cotiz-Test/1.0' },
    });

  /** Contrat du projet posé en base ; `locked` : signé par Awa (contrat verrouillé). */
  const insertContract = async (pid: string, options: { aid?: string; locked?: boolean } = {}) => {
    const id = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO contracts (id, association_id, project_id, body_template, template_sha256, association_signer_name,
                              association_signer_title, association_signed_by, association_signed_at, locked_at)
       VALUES ($1, $2, $3, $4, $5, 'Awa Koné', 'Présidente', $6, $7, $7)`,
      [
        id,
        options.aid ?? A.id,
        pid,
        TEMPLATE,
        sha256(TEMPLATE),
        options.locked === false ? null : USERS.awa,
        options.locked === false ? null : '2026-11-01T09:00:00Z',
      ],
    );
    return id;
  };
  /** Inscription posée en base (par défaut : Moussa, en attente de signature). */
  const enrollment = async (
    pid: string,
    options: { userId?: string; aid?: string; status?: string; startsFrom?: string } = {},
  ) => {
    const id = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO enrollments (id, association_id, project_id, user_id, status, starts_from, joined_at, activated_at)
       VALUES ($1, $2, $3, $4, $5::enrollments_status, $6, now(), CASE WHEN $5 = 'active' THEN now() END)`,
      [
        id,
        options.aid ?? A.id,
        pid,
        options.userId ?? USERS.moussa,
        options.status ?? 'pending_signature',
        options.startsFrom ?? '2026-03-01',
      ],
    );
    return id;
  };
  const outbox = async (type: EventType) =>
    (
      await f.h.superuser(
        `SELECT id::text, association_id, actor_user_id, aggregate_type, aggregate_id, payload, occurred_at
           FROM outbox_events WHERE event_type = $1 ORDER BY id`,
        [type],
      )
    ).rows as {
      id: string;
      association_id: string | null;
      actor_user_id: string | null;
      aggregate_type: string;
      aggregate_id: string;
      payload: Record<string, unknown>;
      occurred_at: Date;
    }[];
  /** Enveloppe de l'événement tel que le relais de l'outbox la passe aux consommateurs. */
  const envelopeOf = async (type: EventType): Promise<EventEnvelope> => {
    const [row] = await outbox(type);
    if (!row) throw new Error(`aucun événement ${type}`);
    return {
      id: row.id,
      type,
      version: 1,
      occurredAt: row.occurred_at.toISOString(),
      associationId: row.association_id,
      actorUserId: row.actor_user_id,
      aggregate: { type: row.aggregate_type, id: row.aggregate_id },
      payload: row.payload,
    };
  };
  const installments = async (enrollmentId: string) =>
    (
      await f.h.superuser(
        `SELECT kind, sequence, due_date::text AS "dueDate", amount_due::int AS "amountDue", status, association_id,
                project_id, user_id
           FROM installments WHERE enrollment_id = $1 ORDER BY kind, sequence`,
        [enrollmentId],
      )
    ).rows as {
      kind: string;
      sequence: number;
      dueDate: string;
      amountDue: number;
      status: string;
      association_id: string;
      project_id: string;
      user_id: string;
    }[];
  const notificationsOf = async (type: string) =>
    (
      await f.h.superuser(
        `SELECT user_id, association_id, action_url FROM notifications WHERE type = $1 ORDER BY user_id`,
        [type],
      )
    ).rows as { user_id: string; association_id: string; action_url: string }[];

  beforeAll(async () => {
    f = await startMembersFixture();
    worker = await NestFactory.createApplicationContext(
      WorkerModule.register(
        loadConfig({
          NODE_ENV: 'test',
          DATABASE_URL: f.h.db.urlFor('cotiz_app'),
          REDIS_URL: f.redis.getConnectionUrl(),
          S3_ENDPOINT: 'http://127.0.0.1:1',
          OUTBOX_RELAY_INTERVAL_MS: '0',
        }),
      ),
      { logger: false },
    );
    associationAName = (
      (await f.h.superuser('SELECT name FROM associations WHERE id = $1', [A.id])).rows as [{ name: string }]
    )[0].name;
    moussaFirstName = (
      (await f.h.superuser('SELECT first_name FROM users WHERE id = $1', [USERS.moussa])).rows as [
        { first_name: string },
      ]
    )[0].first_name;
  });

  afterAll(async () => {
    await worker.close();
    await f.stop();
  });

  beforeEach(async () => {
    testStart = ((await f.h.superuser('SELECT clock_timestamp() AS t')).rows as [{ t: Date }])[0].t;
    await f.h.superuser(
      `BEGIN; SET LOCAL session_replication_role = replica;
       DELETE FROM contract_signatures; DELETE FROM files WHERE purpose = 'contract_pdf'; DELETE FROM contracts;
       DELETE FROM notifications; DELETE FROM outbox_events WHERE event_type LIKE 'contract.%'; COMMIT;`,
    );
    await f.resetMembers();
    await f.h.superuser('UPDATE plans SET features = $2 WHERE id = $1', [PLANS.essentiel, ['contracts']]);
  });

  describe('me.contract', () => {
    it('texte personnalisé (variables remplacées), empreinte, engagement, signataire, consentement', async () => {
      await insertContract(PROJECTS.a);
      await enrollment(PROJECTS.a);
      const contract = await contractOf(PROJECTS.a);
      const body =
        `Je soussigné(e) ${moussaFirstName} Diarra (+225 05 44 21 87 90) m’engage envers ${associationAName} à verser ` +
        `450${NNBSP}000${NBSP}F pour Centre communautaire, soit 18 échéances mensuelles de 25${NNBSP}000${NBSP}F le ` +
        `5, à partir du 1 mars 2026.`;
      expect(contract).toEqual({
        project: { id: PROJECTS.a, name: 'Centre communautaire' },
        association: { id: A.id, name: associationAName, logoFileId: null },
        commitment: {
          entryFee: null,
          installmentAmount: { amount: 25000, currency: 'XOF' },
          frequency: 'monthly',
          periodicCount: 18,
          total: { amount: 450000, currency: 'XOF' },
        },
        body,
        renderedSha256: sha256(body),
        associationSigner: { name: 'Awa Koné', title: 'Présidente', signedAt: '2026-11-01T09:00:00.000Z' },
        consentText: CONSENT,
        signedAt: null,
        pdfFileId: null,
      });
    });

    it('cycle roulant : ni nombre d’échéances ni total', async () => {
      await insertContract(PROJECTS.rollingA);
      await enrollment(PROJECTS.rollingA);
      const contract = await contractOf(PROJECTS.rollingA);
      expect(contract.commitment).toMatchObject({ periodicCount: null, total: null });
      expect(contract.body).toContain('{nb_echeances}');
    });

    it('contrat pas encore verrouillé : texte visible, signature de l’association absente', async () => {
      await insertContract(PROJECTS.a, { locked: false });
      await enrollment(PROJECTS.a);
      expect((await contractOf(PROJECTS.a)).associationSigner.signedAt).toBeNull();
    });

    it('projet sans contrat, non inscrit, inscription d’une autre personne, autre association : 404', async () => {
      await insertContract(PROJECTS.a);
      await insertContract(PROJECTS.b, { aid: B.id });
      expect((await read(PROJECTS.a)).status).toBe(404);
      await enrollment(PROJECTS.a, { userId: USERS.fatou });
      expect((await read(PROJECTS.a)).status).toBe(404);
      await enrollment(PROJECTS.b, { aid: B.id, userId: USERS.fatou });
      const other = await read(PROJECTS.b);
      expect(other.status).toBe(404);
      expect(await codeOf(other)).toBe('not_found');
      await enrollment(PROJECTS.a2);
      expect((await read(PROJECTS.a2)).status).toBe(404);
    });

    it('RLS de contracts élargie : seules ses propres inscriptions (le code filtre seul)', async () => {
      await insertContract(PROJECTS.b, { aid: B.id });
      await enrollment(PROJECTS.b, { aid: B.id, userId: USERS.fatou });
      await f.h.withPolicy('contracts', 'subscriber_enrolled_read', { using: 'true', withCheck: null }, async () => {
        expect((await read(PROJECTS.b)).status).toBe(404);
      });
    });
  });

  describe('me.sign', () => {
    it('vérification de l’étape : empreinte différente du texte → 409 contract_changed, rien n’est écrit', async () => {
      await insertContract(PROJECTS.a);
      const enrollmentId = await enrollment(PROJECTS.a);
      const res = await sign(PROJECTS.a, sha256('un autre texte'));
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('contract_changed');
      const rows = (
        await f.h.superuser(
          `SELECT e.status, (SELECT count(*)::int FROM contract_signatures) AS signatures,
                  (SELECT count(*)::int FROM files WHERE purpose = 'contract_pdf') AS files
             FROM enrollments e WHERE e.id = $1`,
          [enrollmentId],
        )
      ).rows as [{ status: string; signatures: number; files: number }];
      expect(rows[0]).toEqual({ status: 'pending_signature', signatures: 0, files: 0 });
      expect(await outbox('contract.signed')).toEqual([]);
    });

    it('signature : preuve enregistrée, PDF à produire, inscription active, contract.signed ; auditée', async () => {
      const contractId = await insertContract(PROJECTS.a);
      const enrollmentId = await enrollment(PROJECTS.a);
      const shown = await contractOf(PROJECTS.a);
      const res = await sign(PROJECTS.a, shown.renderedSha256);
      expect(res.status).toBe(201);
      const signed = Contract.parse(await res.json());
      expect(signed).toEqual({ ...shown, signedAt: expect.any(String) as string });

      const [signature] = (
        await f.h.superuser(
          `SELECT id, association_id, contract_id, enrollment_id, user_id, rendered_sha256, consent_text,
                  signed_at, ip IS NOT NULL AS has_ip, user_agent, pdf_file_id
             FROM contract_signatures`,
        )
      ).rows as Record<string, unknown>[];
      expect(signature).toMatchObject({
        association_id: A.id,
        contract_id: contractId,
        enrollment_id: enrollmentId,
        user_id: USERS.moussa,
        rendered_sha256: shown.renderedSha256,
        consent_text: CONSENT,
        has_ip: true,
        user_agent: 'Cotiz-Test/1.0',
      });
      expect((signature?.signed_at as Date).toISOString()).toBe(signed.signedAt);
      const [file] = (
        await f.h.superuser(
          `SELECT association_id, owner_user_id, purpose, bucket, object_key, mime_type, scan_status, sha256
             FROM files WHERE id = $1`,
          [signature?.pdf_file_id],
        )
      ).rows as Record<string, unknown>[];
      expect(file).toEqual({
        association_id: A.id,
        owner_user_id: USERS.moussa,
        purpose: 'contract_pdf',
        bucket: 'cotiz-legal',
        object_key: `${A.id}/contract_pdf/${String(signature?.pdf_file_id)}.pdf`,
        mime_type: 'application/pdf',
        scan_status: 'pending',
        sha256: null,
      });
      const [row] = (await f.h.superuser('SELECT status, activated_at FROM enrollments WHERE id = $1', [enrollmentId]))
        .rows as [{ status: string; activated_at: Date | null }];
      expect(row.status).toBe('active');
      expect(row.activated_at).not.toBeNull();
      // Échéancier : par le consommateur de contract.signed (décision 20), pas dans la transaction du souscripteur.
      expect(await installments(enrollmentId)).toEqual([]);
      expect(await outbox('contract.signed')).toEqual([
        expect.objectContaining({
          association_id: A.id,
          actor_user_id: USERS.moussa,
          aggregate_id: signature?.id,
          payload: { signatureId: signature?.id, enrollmentId, userId: USERS.moussa },
        }),
      ]);
      const audits = (
        await f.h.superuser(
          `SELECT actor_user_id, association_id, entity_id FROM audit_logs WHERE action = 'contract.sign'
              AND occurred_at >= $1`,
          [testStart],
        )
      ).rows;
      expect(audits).toEqual([{ actor_user_id: USERS.moussa, association_id: A.id, entity_id: signature?.id }]);
    });

    it('déjà signé : 409 already_signed ; même requête rejouée : même réponse', async () => {
      await insertContract(PROJECTS.a);
      await enrollment(PROJECTS.a);
      const { renderedSha256 } = await contractOf(PROJECTS.a);
      const key = crypto.randomUUID();
      const first = await sign(PROJECTS.a, renderedSha256, { key });
      expect(first.status).toBe(201);
      const firstBody: unknown = await first.json();
      const replay = await sign(PROJECTS.a, renderedSha256, { key });
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(firstBody);
      const again = await sign(PROJECTS.a, renderedSha256);
      expect(again.status).toBe(409);
      expect(await codeOf(again)).toBe('already_signed');
      expect(await outbox('contract.signed')).toHaveLength(1);
    });

    it('deux signatures simultanées : une seule passe, l’autre 409 already_signed', async () => {
      for (let round = 0; round < 3; round++) {
        await f.h.superuser(
          `BEGIN; SET LOCAL session_replication_role = replica;
           DELETE FROM contract_signatures; DELETE FROM files WHERE purpose = 'contract_pdf'; DELETE FROM contracts;
           COMMIT;`,
        );
        await f.resetMembers();
        await insertContract(PROJECTS.a);
        await enrollment(PROJECTS.a);
        const { renderedSha256 } = await contractOf(PROJECTS.a);
        const results = await Promise.all([sign(PROJECTS.a, renderedSha256), sign(PROJECTS.a, renderedSha256)]);
        expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
        const [count] = (await f.h.superuser('SELECT count(*)::int AS n FROM contract_signatures')).rows as [
          { n: number },
        ];
        expect(count.n).toBe(1);
      }
    });

    it('contrat pas encore signé par l’association : 404 (rien à signer)', async () => {
      await insertContract(PROJECTS.a, { locked: false });
      await enrollment(PROJECTS.a);
      const { renderedSha256 } = await contractOf(PROJECTS.a);
      expect((await sign(PROJECTS.a, renderedSha256)).status).toBe(404);
    });

    it('inscription active sans contrat à signer, ou d’une autre personne : 404', async () => {
      await insertContract(PROJECTS.a);
      await enrollment(PROJECTS.a, { status: 'active' });
      expect((await sign(PROJECTS.a, sha256('x'))).status).toBe(404);
      await insertContract(PROJECTS.b, { aid: B.id });
      await enrollment(PROJECTS.b, { aid: B.id, userId: USERS.fatou });
      expect((await sign(PROJECTS.b, sha256('x'))).status).toBe(404);
    });

    it('inscription d’une autre personne de la même association, RLS élargies : 404, rien n’est écrit', async () => {
      await insertContract(PROJECTS.a);
      const fatouEnrollment = await enrollment(PROJECTS.a, { userId: USERS.fatou });
      const wide = { using: 'true', withCheck: 'true' };
      const attempt = () => sign(PROJECTS.a, sha256('x'));
      expect((await attempt()).status).toBe(404);
      const anyRow = { using: 'true', withCheck: null };
      // RLS élargies : seul le code filtre (inscription, projet, contrat et signature de la personne connectée).
      await f.h.withPolicy('projects', 'subscriber_enrolled_read', anyRow, () =>
        f.h.withPolicy('contracts', 'subscriber_enrolled_read', anyRow, () =>
          f.h.withPolicy('enrollments', 'subscriber_self_read', anyRow, () =>
            f.h.withPolicy('enrollments', 'subscriber_sign_update', wide, () =>
              f.h.withPolicy('contract_signatures', 'subscriber_self_read', anyRow, async () => {
                expect((await attempt()).status).toBe(404);
              }),
            ),
          ),
        ),
      );
      const [row] = (await f.h.superuser('SELECT status FROM enrollments WHERE id = $1', [fatouEnrollment])).rows as [
        { status: string },
      ];
      expect(row.status).toBe('pending_signature');
      expect((await f.h.superuser('SELECT 1 FROM contract_signatures')).rowCount).toBe(0);
      expect((await f.h.superuser(`SELECT 1 FROM files WHERE purpose = 'contract_pdf'`)).rowCount).toBe(0);
      expect(await outbox('contract.signed')).toEqual([]);
    });

    it('projet clos (terminé, archivé) : 404, rien à signer, rien n’est écrit', async () => {
      await insertContract(PROJECTS.a);
      const enrollmentId = await enrollment(PROJECTS.a);
      const { renderedSha256 } = await contractOf(PROJECTS.a);
      const [before] = (await f.h.superuser('SELECT status FROM projects WHERE id = $1', [PROJECTS.a])).rows as [
        { status: string },
      ];
      for (const status of ['completed', 'archived']) {
        await f.h.superuser(`UPDATE projects SET status = $2::projects_status WHERE id = $1`, [PROJECTS.a, status]);
        expect((await sign(PROJECTS.a, renderedSha256)).status).toBe(404);
      }
      await f.h.superuser(`UPDATE projects SET status = $2::projects_status WHERE id = $1`, [
        PROJECTS.a,
        before.status,
      ]);
      const [row] = (await f.h.superuser('SELECT status FROM enrollments WHERE id = $1', [enrollmentId])).rows as [
        { status: string },
      ];
      expect(row.status).toBe('pending_signature');
      expect((await f.h.superuser('SELECT 1 FROM contract_signatures')).rowCount).toBe(0);
      expect(await outbox('contract.signed')).toEqual([]);
    });

    it('consentement absent : 422', async () => {
      await insertContract(PROJECTS.a);
      await enrollment(PROJECTS.a);
      const res = await f.call(`/me/projects/${PROJECTS.a}/contract/sign`, {
        token: f.tokens.moussa,
        method: 'POST',
        body: { renderedSha256: sha256('x'), accepted: false },
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      expect(res.status).toBe(422);
    });
  });

  describe('échéancier généré à la signature (consommateur de contract.signed)', () => {
    it('échéances de l’inscription depuis sa date d’entrée, une seule fois même rejoué', async () => {
      await insertContract(PROJECTS.a);
      const enrollmentId = await enrollment(PROJECTS.a);
      const { renderedSha256 } = await contractOf(PROJECTS.a);
      expect((await sign(PROJECTS.a, renderedSha256)).status).toBe(201);
      const event = await envelopeOf('contract.signed');
      const consumer = worker.get(ContractScheduleConsumer);
      await consumer.handle(event);
      const lines = await installments(enrollmentId);
      expect(lines).toHaveLength(18);
      expect(lines[0]).toMatchObject({
        kind: 'periodic',
        sequence: 1,
        dueDate: '2026-03-05',
        amountDue: 25000,
        association_id: A.id,
        project_id: PROJECTS.a,
        user_id: USERS.moussa,
      });
      expect(lines.at(-1)).toMatchObject({ sequence: 18, dueDate: '2027-08-05' });
      // Rattrapage : les échéances passées sont dues ou en retard, comme à l'inscription (Q3).
      expect(lines[0]?.status).toBe('late');
      await consumer.handle(event);
      expect(await installments(enrollmentId)).toHaveLength(18);
    });

    it('même échéancier qu’en.create pour la même date d’entrée (montants, statuts, dates de retard)', async () => {
      const lines = async (enrollmentId: string) =>
        (
          await f.h.superuser(
            `SELECT kind, sequence, due_date::text AS "dueDate", amount_due::text AS "amountDue", status,
                    late_since::text AS "lateSince"
               FROM installments WHERE enrollment_id = $1 ORDER BY kind, sequence`,
            [enrollmentId],
          )
        ).rows as { lateSince: string | null }[];
      const created = await f.call(`/associations/${A.id}/projects/${PROJECTS.a2}/enrollments`, {
        token: f.tokens.awa,
        method: 'POST',
        body: { userId: USERS.moussa, startsFrom: '2026-03-01' },
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      expect(created.status).toBe(201);
      const withoutContract = (
        (
          await f.h.superuser('SELECT id FROM enrollments WHERE project_id = $1 AND user_id = $2', [
            PROJECTS.a2,
            USERS.moussa,
          ])
        ).rows as [{ id: string }]
      )[0].id;
      await insertContract(PROJECTS.a);
      const signed = await enrollment(PROJECTS.a, { startsFrom: '2026-03-01' });
      const { renderedSha256 } = await contractOf(PROJECTS.a);
      expect((await sign(PROJECTS.a, renderedSha256)).status).toBe(201);
      await worker.get(ContractScheduleConsumer).handle(await envelopeOf('contract.signed'));
      const expected = await lines(withoutContract);
      expect(expected.length).toBeGreaterThan(0);
      expect(expected.some((l) => l.lateSince !== null)).toBe(true);
      expect(await lines(signed)).toEqual(expected);
    });

    it('cycle roulant signé tard : horizon de 12 échéances à venir rétabli dès la signature', async () => {
      await insertContract(PROJECTS.rollingA);
      const enrollmentId = await enrollment(PROJECTS.rollingA, { startsFrom: '2026-03-01' });
      const { renderedSha256 } = await contractOf(PROJECTS.rollingA);
      expect((await sign(PROJECTS.rollingA, renderedSha256)).status).toBe(201);
      await worker.get(ContractScheduleConsumer).handle(await envelopeOf('contract.signed'));
      const today = (
        (await f.h.superuser(`SELECT (now() AT TIME ZONE 'Africa/Abidjan')::date::text AS d`)).rows as [{ d: string }]
      )[0].d;
      const periodic = (await installments(enrollmentId)).filter((l) => l.kind === 'periodic');
      expect(periodic.map((l) => l.sequence)).toEqual(periodic.map((_, i) => i + 1));
      expect(periodic.filter((l) => l.dueDate >= today)).toHaveLength(12);
    });

    it('inscription retirée ou inconnue entre-temps : rien n’est généré', async () => {
      await insertContract(PROJECTS.a);
      const enrollmentId = await enrollment(PROJECTS.a);
      const { renderedSha256 } = await contractOf(PROJECTS.a);
      expect((await sign(PROJECTS.a, renderedSha256)).status).toBe(201);
      const event = await envelopeOf('contract.signed');
      await f.h.superuser(`UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1`, [
        enrollmentId,
      ]);
      await worker.get(ContractScheduleConsumer).handle(event);
      expect(await installments(enrollmentId)).toEqual([]);
      await worker
        .get(ContractScheduleConsumer)
        .handle({ ...event, payload: { ...event.payload, enrollmentId: crypto.randomUUID() } });
      expect(await installments(enrollmentId)).toEqual([]);
    });
    it('événement d’une autre association que celle de l’inscription : rien n’est généré', async () => {
      await insertContract(PROJECTS.a);
      const enrollmentId = await enrollment(PROJECTS.a);
      const { renderedSha256 } = await contractOf(PROJECTS.a);
      expect((await sign(PROJECTS.a, renderedSha256)).status).toBe(201);
      const event = await envelopeOf('contract.signed');
      await worker.get(ContractScheduleConsumer).handle({ ...event, associationId: B.id });
      expect(await installments(enrollmentId)).toEqual([]);
    });
  });

  describe('notifications', () => {
    it('contract.signed : les gestionnaires, lien vers le contrat du projet', async () => {
      await insertContract(PROJECTS.a);
      await enrollment(PROJECTS.a);
      const { renderedSha256 } = await contractOf(PROJECTS.a);
      expect((await sign(PROJECTS.a, renderedSha256)).status).toBe(201);
      await worker.get(NotificationsConsumer).handle(await envelopeOf('contract.signed'));
      const rows = await notificationsOf('contract.signed');
      expect(rows.map((r) => r.user_id)).toContain(USERS.awa);
      expect(rows.map((r) => r.user_id)).not.toContain(USERS.moussa);
      for (const row of rows) {
        expect(row).toMatchObject({ association_id: A.id, action_url: `/asso/projets/${PROJECTS.a}/contrat` });
      }
    });

    it('contract.signature_required : le souscripteur, lien vers la signature', async () => {
      await insertContract(PROJECTS.a);
      const res = await f.call(`/associations/${A.id}/projects/${PROJECTS.a}/enrollments`, {
        token: f.tokens.awa,
        method: 'POST',
        body: { userId: USERS.moussa },
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      expect(res.status).toBe(201);
      await worker.get(NotificationsConsumer).handle(await envelopeOf('contract.signature_required'));
      expect(await notificationsOf('contract.signature_required')).toEqual([
        { user_id: USERS.moussa, association_id: A.id, action_url: `/projets/${PROJECTS.a}/contrat` },
      ]);
    });

    it('événements portant une autre association : aucune notification', async () => {
      await insertContract(PROJECTS.a);
      await enrollment(PROJECTS.a);
      const { renderedSha256 } = await contractOf(PROJECTS.a);
      expect((await sign(PROJECTS.a, renderedSha256)).status).toBe(201);
      const consumer = worker.get(NotificationsConsumer);
      const signed = await envelopeOf('contract.signed');
      await consumer.handle({ ...signed, associationId: B.id });
      await consumer.handle({
        ...signed,
        id: `${signed.id}1`,
        type: 'contract.signature_required',
        associationId: B.id,
        payload: { enrollmentId: signed.payload.enrollmentId, userId: USERS.moussa, projectId: PROJECTS.a },
      });
      await consumer.handle({
        ...signed,
        id: `${signed.id}2`,
        type: 'contract.locked',
        associationId: B.id,
        aggregate: { type: 'contract', id: crypto.randomUUID() },
        payload: { contractId: crypto.randomUUID(), projectId: PROJECTS.a },
      });
      expect(await f.h.superuser('SELECT 1 FROM notifications').then((r) => r.rowCount)).toBe(0);
    });

    it('contract.locked : les souscripteurs en attente de signature seulement', async () => {
      await insertContract(PROJECTS.a, { locked: false });
      await enrollment(PROJECTS.a);
      await enrollment(PROJECTS.a, { userId: USERS.aminata, status: 'active' });
      const res = await f.call(`/associations/${A.id}/projects/${PROJECTS.a}/contract/lock`, {
        token: f.tokens.awa,
        method: 'POST',
        headers: { 'if-match': 'W/"1"' },
      });
      expect(res.status).toBe(200);
      await worker.get(NotificationsConsumer).handle(await envelopeOf('contract.locked'));
      expect(await notificationsOf('contract.locked')).toEqual([
        { user_id: USERS.moussa, association_id: A.id, action_url: `/projets/${PROJECTS.a}/contrat` },
      ]);
    });
  });
});
