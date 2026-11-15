import { createHash } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { EventEnvelope } from '@cotiz/contracts';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { IssueInvoicesUseCase } from '../../src/modules/billing/application/issue-invoices.use-case.js';
import { GenerateInvoicePdfUseCase } from '../../src/modules/documents/application/generate-invoice-pdf.use-case.js';
import { InvoiceIssuedConsumer } from '../../src/modules/documents/events/invoice-issued.consumer.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../src/shared/queues/index.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B } from '../isolation/harness.js';
import { type FakeGotenberg, startFakeGotenberg } from '../support/fake-gotenberg.js';
import { startMinio, type TestMinio } from '../support/minio.js';
import { type PlatformFixture, startPlatformFixture } from './platform-associations.fixture.js';

/**
 * Lot 4.6 · étape 2 : PDF des factures. `subscription.invoice_issued` → job `invoice-pdf` (file `documents`) →
 * gabarit `invoiceDocument` → Gotenberg (faux) → `cotiz-legal`, une seule fois ; lu par les gestionnaires de
 * l'association (`as.file`), jamais par une autre association.
 */

const sha256 = (content: Uint8Array) => createHash('sha256').update(content).digest('hex');

describe('PDF des factures (worker documents)', () => {
  let f: PlatformFixture;
  let minio: TestMinio;
  let gotenberg: FakeGotenberg;
  let worker: INestApplicationContext;
  let awa: string;
  let koffi: string;

  const invoiceOfA = async () =>
    (
      await f.h.superuser(
        `SELECT i.id::text, i.number, i.pdf_file_id::text AS file_id, f.scan_status, f.sha256
           FROM invoices i JOIN files f ON f.id = i.pdf_file_id
          WHERE i.association_id = $1 ORDER BY i.number LIMIT 1`,
        [A.id],
      )
    ).rows[0] as { id: string; number: string; file_id: string; scan_status: string; sha256: string | null };
  const generate = (invoiceId: string, associationId = A.id) =>
    worker.get(GenerateInvoicePdfUseCase).execute({ associationId, invoiceId });
  const download = async (aid: string, fileId: string, token: string) => {
    const res = await fetch(`${f.base}/associations/${aid}/files/${fileId}`, {
      headers: { authorization: `Bearer ${token}` },
      redirect: 'manual',
    });
    if (res.status !== 302) return { status: res.status, content: null };
    const object = await fetch(res.headers.get('location') ?? '');
    expect(object.status).toBe(200);
    return { status: 302, content: new Uint8Array(await object.arrayBuffer()) };
  };

  beforeAll(async () => {
    [minio, gotenberg] = await Promise.all([startMinio(), startFakeGotenberg()]);
    const storage = {
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY_ID: minio.accessKeyId,
      S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
    };
    f = await startPlatformFixture([], storage);
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
    awa = await f.login('association', 'awa@test.cotiz.app');
    koffi = await f.login('association', 'koffi@test.cotiz.app');
    await worker.get(IssueInvoicesUseCase).execute(new Date('2026-11-13T10:00:00Z'));
  });

  afterAll(async () => {
    await worker.close();
    await f.stop();
    await Promise.all([minio.stop(), gotenberg.close()]);
  });

  it('PDF produit une seule fois (rejeu, génération concurrente), identique à chaque téléchargement', async () => {
    const invoice = await invoiceOfA();
    expect(invoice.scan_status).toBe('pending');
    // En attente : jamais servi.
    expect((await download(A.id, invoice.file_id, awa)).status).toBe(404);

    await Promise.all([generate(invoice.id), generate(invoice.id)]);
    await generate(invoice.id);
    const done = await invoiceOfA();
    expect(done.scan_status).toBe('clean');
    // Le faux Gotenberg numérote ses rendus : un second objet écrit aurait changé l'empreinte.
    const first = await download(A.id, invoice.file_id, awa);
    const second = await download(A.id, invoice.file_id, awa);
    expect(first.status).toBe(302);
    expect(first.content && sha256(first.content)).toBe(done.sha256);
    expect(second.content && sha256(second.content)).toBe(done.sha256);
    const html = gotenberg.requests.at(-1)?.html ?? '';
    expect(html).toContain(invoice.number);
    expect(html).toContain('Entraide Yopougon');
  });

  it('un gestionnaire de B ne lit pas le PDF de A', async () => {
    const invoice = await invoiceOfA();
    expect((await download(A.id, invoice.file_id, koffi)).status).toBe(404);
    expect((await download(B.id, invoice.file_id, koffi)).status).toBe(404);
  });

  it('facture d’une autre association demandée dans le contexte de A : rien produit', async () => {
    const [ofB] = (await f.h.superuser(`SELECT id::text FROM invoices WHERE association_id = $1`, [B.id])).rows as {
      id: string;
    }[];
    expect(ofB).toBeDefined();
    const before = gotenberg.requests.length;
    await generate(ofB?.id ?? '', A.id);
    expect(gotenberg.requests.length).toBe(before);
  });

  it('subscription.invoice_issued → un job invoice-pdf par événement ; association de l’enveloppe exigée', async () => {
    const queue = new Queue(QUEUES.documents.name, {
      connection: redisConnection(f.redis.getConnectionUrl()),
      prefix: REDIS_PREFIX,
    });
    try {
      const invoice = await invoiceOfA();
      const envelope: EventEnvelope = {
        id: '1001',
        type: 'subscription.invoice_issued',
        version: 1,
        occurredAt: new Date().toISOString(),
        associationId: A.id,
        actorUserId: null,
        aggregate: { type: 'invoice', id: invoice.id },
        payload: { invoiceId: invoice.id, associationId: A.id },
      };
      const consumer = worker.get(InvoiceIssuedConsumer);
      await consumer.handle(envelope);
      await consumer.handle(envelope);
      await consumer.handle({ ...envelope, id: '1002', associationId: B.id });
      const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed']);
      const ours = jobs.filter((j) => j.name === 'invoice-pdf' && j.id?.startsWith('invoice-pdf-100'));
      expect(ours.map((j) => j.id)).toEqual(['invoice-pdf-1001']);
      expect(ours[0]?.data).toMatchObject({ associationId: A.id, invoiceId: invoice.id });
    } finally {
      await queue.close();
    }
  });
});
