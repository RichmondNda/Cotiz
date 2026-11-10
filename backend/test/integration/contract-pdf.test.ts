import { createHash } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ENDPOINTS, type EventEnvelope } from '@cotiz/contracts';
import { ListObjectVersionsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { GenerateContractPdfUseCase } from '../../src/modules/documents/application/generate-contract-pdf.use-case.js';
import { ContractSignedConsumer } from '../../src/modules/documents/events/contract-signed.consumer.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../src/shared/queues/index.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type FakeGotenberg, startFakeGotenberg } from '../support/fake-gotenberg.js';
import { startMinio, type TestMinio } from '../support/minio.js';
import { type MembersFixture, PROJECTS, startMembersFixture } from './members.fixture.js';
import { PLANS } from './platform-associations.fixture.js';

/**
 * Lot 4.1 · étape 4 : PDF du contrat signé. Worker `documents` : texte relu et comparé à l'empreinte signée, gabarit
 * `@cotiz/pdf-templates` (contrat + page de preuve) → Gotenberg (faux ici, vrai dans test/gotenberg) → `cotiz-legal` ;
 * `files` complété une seule fois (jamais régénéré). Vérification de l'étape : PDF identique octet pour octet à chaque
 * téléchargement (empreinte = `files.sha256`). me.contracts ; `contractSignedAt` dans les vues gestionnaire.
 */

const Contract = ENDPOINTS['me.contract'].operations.get.response.body;
const Contracts = ENDPOINTS['me.contracts'].operations.list.response.body;
const Enrollments = ENDPOINTS['en.list'].operations.list.response.body;
const sha256 = (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');

const TEMPLATE = 'Je soussigné(e) {nom_souscripteur} m’engage envers {association} à verser {montant} pour {projet}.';

describe('PDF du contrat signé (worker documents, me.contracts)', () => {
  let f: MembersFixture;
  let minio: TestMinio;
  let gotenberg: FakeGotenberg;
  let worker: INestApplicationContext;

  const read = (pid: string) => f.call(`/me/projects/${pid}/contract`, { token: f.tokens.moussa });
  const contractOf = async (pid: string) => {
    const res = await read(pid);
    expect(res.status).toBe(200);
    return Contract.parse(await res.json());
  };
  const sign = async (pid: string) => {
    const { renderedSha256 } = await contractOf(pid);
    const res = await f.call(`/me/projects/${pid}/contract/sign`, {
      token: f.tokens.moussa,
      method: 'POST',
      body: { renderedSha256, accepted: true },
      headers: { 'idempotency-key': crypto.randomUUID(), 'user-agent': 'Cotiz-Test/1.0' },
    });
    expect(res.status).toBe(201);
    return Contract.parse(await res.json());
  };
  const insertContract = async (pid: string, options: { aid?: string; locked?: boolean } = {}) => {
    await f.h.superuser(
      `INSERT INTO contracts (id, association_id, project_id, body_template, template_sha256, association_signer_name,
                              association_signer_title, association_signed_by, association_signed_at, locked_at)
       VALUES ($1, $2, $3, $4, $5, 'Awa Koné', 'Présidente', $6, $7, $7)`,
      [
        crypto.randomUUID(),
        options.aid ?? A.id,
        pid,
        TEMPLATE,
        sha256(TEMPLATE),
        options.locked === false ? null : USERS.awa,
        options.locked === false ? null : '2026-11-01T09:00:00Z',
      ],
    );
  };
  const enrollment = async (
    pid: string,
    options: { userId?: string; aid?: string; status?: string; joinedAt?: string } = {},
  ) => {
    const id = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO enrollments (id, association_id, project_id, user_id, status, starts_from, joined_at, activated_at,
                                withdrawn_at)
       VALUES ($1, $2, $3, $4, $5::enrollments_status, '2026-03-01', $6, CASE WHEN $5 = 'active' THEN now() END,
               CASE WHEN $5 = 'withdrawn' THEN now() END)`,
      [
        id,
        options.aid ?? A.id,
        pid,
        options.userId ?? USERS.moussa,
        options.status ?? 'pending_signature',
        options.joinedAt ?? new Date().toISOString(),
      ],
    );
    return id;
  };
  const signatureOf = async (enrollmentId: string) =>
    (
      (
        await f.h.superuser(
          `SELECT s.id, s.pdf_file_id, s.rendered_sha256, c.template_sha256, s.signed_at, host(s.ip) AS ip,
                  s.user_agent, s.consent_text, s.rendered_body, s.user_id
             FROM contract_signatures s JOIN contracts c ON c.id = s.contract_id WHERE s.enrollment_id = $1`,
          [enrollmentId],
        )
      ).rows as {
        id: string;
        pdf_file_id: string;
        rendered_sha256: string;
        template_sha256: string;
        signed_at: Date;
        ip: string | null;
        user_agent: string | null;
        consent_text: string;
        rendered_body: string;
        user_id: string;
      }[]
    )[0];
  const fileRow = async (id: string) =>
    (
      (await f.h.superuser('SELECT * FROM files WHERE id = $1', [id])).rows as {
        bucket: string;
        object_key: string;
        scan_status: string;
        sha256: string | null;
        size_bytes: string;
        mime_type: string;
      }[]
    )[0];
  const generate = (signatureId: string, associationId: string = A.id) =>
    worker.get(GenerateContractPdfUseCase).execute({ associationId, signatureId });
  /**
   * fl.get (souscripteur) ou as.file (gestionnaire, `aid` : décision 24) : 302 vers l'URL signée, puis le contenu servi
   * par MinIO.
   */
  const download = async (fileId: string, token: string, aid?: string) => {
    const path = aid ? `/associations/${aid}/files/${fileId}` : `/files/${fileId}`;
    const res = await fetch(`${f.base}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      redirect: 'manual',
    });
    if (res.status !== 302) return { status: res.status, content: null };
    const location = res.headers.get('location');
    if (!location) throw new Error('302 sans Location');
    const object = await fetch(location);
    expect(object.status).toBe(200);
    return { status: 302, content: new Uint8Array(await object.arrayBuffer()) };
  };
  /** Inscription signée de Moussa sur PROJECTS.a et sa signature. */
  const signed = async () => {
    await insertContract(PROJECTS.a);
    const enrollmentId = await enrollment(PROJECTS.a);
    const shown = await sign(PROJECTS.a);
    const signature = await signatureOf(enrollmentId);
    if (!signature) throw new Error('signature absente');
    return { enrollmentId, shown, signature };
  };

  beforeAll(async () => {
    [minio, gotenberg] = await Promise.all([startMinio(), startFakeGotenberg()]);
    const storage = {
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY_ID: minio.accessKeyId,
      S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
    };
    f = await startMembersFixture(storage);
    worker = await NestFactory.createApplicationContext(
      WorkerModule.register(
        loadConfig({
          NODE_ENV: 'test',
          DATABASE_URL: f.h.db.urlFor('cotiz_app'),
          REDIS_URL: f.redis.getConnectionUrl(),
          OUTBOX_RELAY_INTERVAL_MS: '0',
          GOTENBERG_URL: gotenberg.url,
          ...storage,
        }),
      ),
      { logger: false },
    );
  });

  afterAll(async () => {
    await worker.close();
    await f.stop();
    await Promise.all([minio.stop(), gotenberg.close()]);
  });

  beforeEach(async () => {
    gotenberg.requests.length = 0;
    await f.h.superuser(
      `BEGIN; SET LOCAL session_replication_role = replica;
       DELETE FROM contract_signatures; DELETE FROM files WHERE purpose = 'contract_pdf'; DELETE FROM contracts;
       DELETE FROM outbox_events WHERE event_type LIKE 'contract.%'; COMMIT;`,
    );
    await f.resetMembers();
    await f.h.superuser('UPDATE plans SET features = $2 WHERE id = $1', [PLANS.essentiel, ['contracts']]);
  });

  describe('génération (worker documents)', () => {
    it('vérification de l’étape : PDF produit une fois, identique octet pour octet à chaque téléchargement', async () => {
      const { signature } = await signed();
      expect((await fileRow(signature.pdf_file_id))?.scan_status).toBe('pending');
      expect((await contractOf(PROJECTS.a)).pdfFileId).toBeNull();

      await generate(signature.id);
      const file = await fileRow(signature.pdf_file_id);
      expect(file).toMatchObject({
        bucket: 'cotiz-legal',
        object_key: `${A.id}/contract_pdf/${signature.pdf_file_id}.pdf`,
        scan_status: 'clean',
        mime_type: 'application/pdf',
      });
      expect(gotenberg.requests).toHaveLength(1);
      expect((await contractOf(PROJECTS.a)).pdfFileId).toBe(signature.pdf_file_id);

      const first = await download(signature.pdf_file_id, f.tokens.moussa);
      const second = await download(signature.pdf_file_id, f.tokens.moussa);
      const manager = await download(signature.pdf_file_id, f.tokens.awa, A.id);
      expect(first.status).toBe(302);
      if (!first.content || !second.content || !manager.content) {
        throw new Error(`PDF non servi : ${String(first.status)} ${String(second.status)} ${String(manager.status)}`);
      }
      expect(Buffer.from(first.content).subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(Buffer.compare(first.content, second.content)).toBe(0);
      expect(Buffer.compare(first.content, manager.content)).toBe(0);
      expect(sha256(first.content)).toBe(file?.sha256);
      expect(Number(file?.size_bytes)).toBe(first.content.length);

      // Jamais régénéré : rejouer la génération ne rappelle pas le moteur, ne change ni l'objet ni l'empreinte.
      await generate(signature.id);
      expect(gotenberg.requests).toHaveLength(1);
      expect((await fileRow(signature.pdf_file_id))?.sha256).toBe(file?.sha256);
      const third = await download(signature.pdf_file_id, f.tokens.moussa);
      if (!third.content) throw new Error('PDF non servi');
      expect(Buffer.compare(first.content, third.content)).toBe(0);
    });

    it('contenu : le texte signé et la page de preuve, polices jointes, format de la page du gabarit', async () => {
      const { shown, signature } = await signed();
      await generate(signature.id);
      const [request] = gotenberg.requests;
      if (!request) throw new Error('aucune conversion');
      expect(request.path).toBe('/forms/chromium/convert/html');
      expect(request.fields.preferCssPageSize).toBe('true');
      expect(request.files).toContain('index.html');
      expect(request.files.filter((name) => name.endsWith('.woff2')).length).toBeGreaterThanOrEqual(4);
      const proof = request.html.slice(request.html.indexOf('class="proof"'));
      expect(request.html).toContain(shown.body);
      for (const value of [
        'Page de preuve',
        signature.id,
        signature.rendered_sha256,
        signature.template_sha256,
        signature.signed_at.toISOString(),
        signature.consent_text,
        'Cotiz-Test/1.0',
        'Awa Koné',
      ]) {
        expect(proof).toContain(value);
      }
      if (signature.ip) expect(proof).toContain(signature.ip);
    });

    it('projet et souscripteur renommés après la signature : le PDF reproduit le texte signé', async () => {
      const { shown, signature } = await signed();
      expect(signature.rendered_body).toBe(shown.body);
      // Renommés en contournant les gardes : le texte rendu aujourd'hui serait différent, le texte signé non.
      await f.h.superuser(
        `BEGIN; SET LOCAL session_replication_role = replica;
         UPDATE projects SET name = name || ' (modifié)' WHERE id = '${PROJECTS.a}';
         UPDATE users SET first_name = first_name || 'x' WHERE id = '${signature.user_id}'; COMMIT;`,
      );
      try {
        await generate(signature.id);
        const [request] = gotenberg.requests;
        if (!request) throw new Error('aucune conversion');
        expect(request.html).toContain(shown.body);
        expect((await fileRow(signature.pdf_file_id))?.scan_status).toBe('clean');
      } finally {
        await f.h.superuser(
          `BEGIN; SET LOCAL session_replication_role = replica;
           UPDATE projects SET name = replace(name, ' (modifié)', '') WHERE id = '${PROJECTS.a}';
           UPDATE users SET first_name = left(first_name, -1) WHERE id = '${signature.user_id}'; COMMIT;`,
        );
      }
    });

    it('texte stocké qui ne donne plus l’empreinte signée : aucun PDF (erreur, rien n’est écrit)', async () => {
      const { signature } = await signed();
      await f.h.superuser(
        `BEGIN; SET LOCAL session_replication_role = replica;
         UPDATE contract_signatures SET rendered_body = rendered_body || ' ' WHERE id = '${signature.id}'; COMMIT;`,
      );
      await expect(generate(signature.id)).rejects.toThrow(/empreinte/);
      expect(gotenberg.requests).toHaveLength(0);
      expect((await fileRow(signature.pdf_file_id))?.scan_status).toBe('pending');
    });

    it('moteur indisponible : erreur (le job sera repris), PDF toujours en attente, puis produit', async () => {
      const { signature } = await signed();
      gotenberg.failNext(1);
      await expect(generate(signature.id)).rejects.toThrow();
      expect((await fileRow(signature.pdf_file_id))?.scan_status).toBe('pending');
      await generate(signature.id);
      expect((await fileRow(signature.pdf_file_id))?.scan_status).toBe('clean');
    });

    it('signature d’une autre association que celle annoncée : rien n’est produit', async () => {
      const { signature } = await signed();
      await generate(signature.id, B.id);
      expect(gotenberg.requests).toHaveLength(0);
      expect((await fileRow(signature.pdf_file_id))?.scan_status).toBe('pending');
    });

    it('objet déjà écrit à sa clé (COMMIT perdu) : jamais réécrit (WORM), empreinte de l’objet conservé', async () => {
      const { signature } = await signed();
      const file = await fileRow(signature.pdf_file_id);
      if (!file) throw new Error('fichier absent');
      const s3 = new S3Client({
        endpoint: minio.endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: minio.accessKeyId, secretAccessKey: minio.secretAccessKey },
      });
      try {
        const earlier = Buffer.from('%PDF-1.7\n% première écriture\n%%EOF\n');
        await s3.send(
          new PutObjectCommand({
            Bucket: file.bucket,
            Key: file.object_key,
            Body: earlier,
            ContentType: 'application/pdf',
            ChecksumAlgorithm: 'SHA256',
          }),
        );
        await generate(signature.id);
        const after = await fileRow(signature.pdf_file_id);
        expect(after).toMatchObject({ scan_status: 'clean', sha256: sha256(earlier) });
        expect(Number(after?.size_bytes)).toBe(earlier.length);
        const versions = await s3.send(new ListObjectVersionsCommand({ Bucket: file.bucket, Prefix: file.object_key }));
        expect(versions.Versions ?? []).toHaveLength(1);
        const served = await download(signature.pdf_file_id, f.tokens.moussa);
        expect(served.content && Buffer.compare(served.content, earlier)).toBe(0);
      } finally {
        s3.destroy();
      }
    });

    it('RLS élargies dans le contexte de l’association annoncée : le code filtre seul, rien n’est produit', async () => {
      const { signature } = await signed();
      const wide = { using: 'true', withCheck: 'true' };
      await f.h.withPolicy('contract_signatures', 'tenant_isolation', wide, () =>
        f.h.withPolicy('files', 'tenant_isolation', wide, async () => {
          await generate(signature.id, B.id);
        }),
      );
      expect(gotenberg.requests).toHaveLength(0);
      expect((await fileRow(signature.pdf_file_id))?.scan_status).toBe('pending');
    });

    it('contract.signed → un job `contract-pdf` dans la file documents (un seul par événement)', async () => {
      const { signature } = await signed();
      const [row] = (
        await f.h.superuser(
          `SELECT id::text, association_id, actor_user_id, aggregate_type, aggregate_id, payload, occurred_at
             FROM outbox_events WHERE event_type = 'contract.signed'`,
        )
      ).rows as {
        id: string;
        association_id: string;
        actor_user_id: string;
        aggregate_type: string;
        aggregate_id: string;
        payload: Record<string, unknown>;
        occurred_at: Date;
      }[];
      if (!row) throw new Error('aucun contract.signed');
      const event: EventEnvelope = {
        id: row.id,
        type: 'contract.signed',
        version: 1,
        occurredAt: row.occurred_at.toISOString(),
        associationId: row.association_id,
        actorUserId: row.actor_user_id,
        aggregate: { type: row.aggregate_type, id: row.aggregate_id },
        payload: row.payload,
      };
      const queue = new Queue(QUEUES.documents.name, {
        connection: redisConnection(f.redis.getConnectionUrl()),
        prefix: REDIS_PREFIX,
      });
      try {
        const consumer = worker.get(ContractSignedConsumer);
        await consumer.handle(event);
        await consumer.handle(event);
        const job = await queue.getJob(`contract-pdf-${row.id}`);
        expect(job?.name).toBe('contract-pdf');
        expect(job?.data).toMatchObject({ associationId: A.id, signatureId: signature.id });
        const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed']);
        expect(jobs.filter((j) => j.name === 'contract-pdf')).toHaveLength(1);
      } finally {
        await queue.obliterate({ force: true });
        await queue.close();
      }
    });
  });

  describe('téléchargement (fl.get) : isolation', () => {
    it('PDF d’une autre personne, même en RLS élargie : 404 pour le souscripteur', async () => {
      const fileId = crypto.randomUUID();
      await f.h.superuser(
        `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                            size_bytes, sha256, scan_status)
         VALUES ($1, $2, $3, 'contract_pdf', 'cotiz-legal', $4, 'contrat-signe.pdf', 'application/pdf', 10, $5, 'clean')`,
        [fileId, B.id, USERS.fatou, `${B.id}/contract_pdf/${fileId}.pdf`, sha256('x')],
      );
      expect((await download(fileId, f.tokens.moussa)).status).toBe(404);
      await f.h.withPolicy('files', 'subscriber_contract_pdf_read', { using: 'true', withCheck: null }, async () => {
        expect((await download(fileId, f.tokens.moussa)).status).toBe(404);
      });
      // Gestionnaire d'une autre association (Awa, owner de A) : 404 sous A ; sous B, pas membre.
      expect((await download(fileId, f.tokens.awa, A.id)).status).toBe(404);
      expect((await download(fileId, f.tokens.awa, B.id)).status).toBe(404);
    });
  });

  describe('dépôt (fl.upload › complete)', () => {
    it('le PDF du contrat est produit par le serveur : sa confirmation de dépôt par le souscripteur → 404', async () => {
      const { signature } = await signed();
      const res = await f.call(`/uploads/${signature.pdf_file_id}/complete`, {
        token: f.tokens.moussa,
        method: 'POST',
      });
      expect(res.status).toBe(404);
      expect((await fileRow(signature.pdf_file_id))?.scan_status).toBe('pending');
    });
  });

  describe('me.contracts', () => {
    it('à signer d’abord, puis signés (date, PDF une fois produit) ; ni retirée, ni sans contrat, ni d’autrui', async () => {
      await insertContract(PROJECTS.a2);
      const toSign = await enrollment(PROJECTS.a2);
      const { signature } = await signed();
      await insertContract(PROJECTS.rollingA);
      await enrollment(PROJECTS.rollingA, { status: 'withdrawn' });
      await insertContract(PROJECTS.b, { aid: B.id });
      await enrollment(PROJECTS.b, { aid: B.id, userId: USERS.fatou });

      const list = async () => {
        const res = await f.call('/me/contracts', { token: f.tokens.moussa });
        expect(res.status).toBe(200);
        return Contracts.parse(await res.json()).items;
      };
      const before = await list();
      expect(before.map((i) => [i.project.id, i.status])).toEqual([
        [PROJECTS.a2, 'to_sign'],
        [PROJECTS.a, 'signed'],
      ]);
      expect(before[0]).toMatchObject({ association: { id: A.id }, signedAt: null, pdfFileId: null });
      expect(before[1]?.signedAt).toBe(signature.signed_at.toISOString());
      expect(before[1]?.pdfFileId).toBeNull();
      expect(toSign).toBeTruthy();

      await generate(signature.id);
      expect((await list())[1]?.pdfFileId).toBe(signature.pdf_file_id);
    });

    it('inscription retirée après la signature : contrat signé gardé (marqué), consultable, PDF téléchargeable', async () => {
      const { enrollmentId, signature } = await signed();
      await generate(signature.id);
      await f.h.superuser(`UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1`, [
        enrollmentId,
      ]);
      const res = await f.call('/me/contracts', { token: f.tokens.moussa });
      expect(res.status).toBe(200);
      expect(Contracts.parse(await res.json()).items).toEqual([
        expect.objectContaining({
          project: expect.objectContaining({ id: PROJECTS.a }) as unknown,
          status: 'signed',
          signedAt: signature.signed_at.toISOString(),
          pdfFileId: signature.pdf_file_id,
          enrollmentWithdrawn: true,
        }),
      ]);
      const contract = await f.call(`/me/projects/${PROJECTS.a}/contract`, { token: f.tokens.moussa });
      expect(contract.status).toBe(200);
      expect(((await contract.json()) as { signedAt: string | null }).signedAt).toBe(signature.signed_at.toISOString());
      expect((await download(signature.pdf_file_id, f.tokens.moussa)).status).toBe(302);
    });

    it('RLS élargies : seulement ses propres inscriptions et signatures (le code filtre seul)', async () => {
      await insertContract(PROJECTS.a);
      await enrollment(PROJECTS.a, { userId: USERS.fatou });
      const anyRow = { using: 'true', withCheck: null };
      await f.h.withPolicy('enrollments', 'subscriber_self_read', anyRow, () =>
        f.h.withPolicy('contracts', 'subscriber_enrolled_read', anyRow, () =>
          f.h.withPolicy('projects', 'subscriber_enrolled_read', anyRow, () =>
            f.h.withPolicy('contract_signatures', 'subscriber_self_read', anyRow, async () => {
              const res = await f.call('/me/contracts', { token: f.tokens.moussa });
              expect(Contracts.parse(await res.json()).items).toEqual([]);
            }),
          ),
        ),
      );
    });
  });

  describe('vues gestionnaire', () => {
    it('en.list : contractSignedAt de l’inscription signée, null sinon', async () => {
      const { enrollmentId, signature } = await signed();
      const res = await f.call(`/associations/${A.id}/projects/${PROJECTS.a}/enrollments`, { token: f.tokens.awa });
      expect(res.status).toBe(200);
      const items = Enrollments.parse(await res.json()).items;
      expect(items.find((i) => i.id === enrollmentId)?.contractSignedAt).toBe(signature.signed_at.toISOString());
      expect(items.filter((i) => i.id !== enrollmentId).every((i) => i.contractSignedAt === null)).toBe(true);
    });
  });
});
