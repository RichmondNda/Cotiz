import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ENDPOINTS, type EventEnvelope } from '@cotiz/contracts';
import { REVERT_WINDOW_MS } from '@cotiz/domain';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { GenerateReceiptPdfUseCase } from '../../src/modules/documents/application/generate-receipt-pdf.use-case.js';
import {
  PaymentValidatedConsumer,
  RECEIPT_DELAY_MS,
} from '../../src/modules/documents/events/payment-validated.consumer.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../src/shared/queues/index.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type FakeGotenberg, startFakeGotenberg } from '../support/fake-gotenberg.js';
import { startMinio, type TestMinio } from '../support/minio.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';

/**
 * Lot 4.6 · étape 5 : reçu de paiement. `payment.validated` → job `receipt-pdf` (file `documents`) différé au-delà du
 * délai d'annulation (10 min) → le registre revérifie que le paiement est toujours validé, réserve le fichier
 * (`payments.receipt_file_id`) → gabarit `receiptDocument` → Gotenberg (faux) → `cotiz-legal`, une seule fois ; lu
 * par le souscripteur (me.payment, fl.get) et les gestionnaires de l'association (as.file), par personne d'autre.
 *
 * Horloge réelle : la validation est datée par la base ; le passage du job reçoit son instant (`now`).
 */

const Detail = ENDPOINTS['me.payment'].operations.get.response.body;
const MINUTE = 60_000;

describe('reçu de paiement (worker documents)', () => {
  let f: LedgerFixture;
  let minio: TestMinio;
  let gotenberg: FakeGotenberg;
  let worker: INestApplicationContext;
  let fatou: string;

  const generate = (paymentId: string, now: Date, associationId = A.id) =>
    worker.get(GenerateReceiptPdfUseCase).execute({ associationId, paymentId }, now);
  const receiptOf = async (paymentId: string) =>
    (
      (
        await f.h.superuser(
          `SELECT p.receipt_file_id::text AS file_id, f.purpose, f.bucket, f.scan_status, f.owner_user_id::text AS owner,
                  f.object_key
             FROM payments p LEFT JOIN files f ON f.id = p.receipt_file_id WHERE p.id = $1`,
          [paymentId],
        )
      ).rows as {
        file_id: string | null;
        purpose: string | null;
        bucket: string | null;
        scan_status: string | null;
        owner: string | null;
        object_key: string | null;
      }[]
    )[0];
  const review = (paymentId: string, action: 'validate' | 'revert-validation', token = f.tokens.awa) =>
    f.call(`/associations/${A.id}/payments/${paymentId}/${action}`, {
      token,
      method: 'POST',
      body: {},
      headers: {
        'idempotency-key': crypto.randomUUID(),
        ...(action === 'validate' ? { 'if-match': 'W/"1"' } : {}),
      },
    });
  const detail = async (paymentId: string, token = f.tokens.moussa) => {
    const res = await f.call(`/me/payments/${paymentId}`, { token });
    expect(res.status).toBe(200);
    return Detail.parse(await res.json());
  };
  const location = async (path: string, token: string) => {
    const res = await fetch(`${f.base}${path}`, { headers: { authorization: `Bearer ${token}` }, redirect: 'manual' });
    return { status: res.status, location: res.headers.get('location') };
  };
  /** Paiement de Moussa (50 000 F pour mars et avril), validé par Awa : sa date de relecture. */
  const validated = async () => {
    const enrollment = await f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-03-01' });
    const paymentId = await f.record({
      enrollmentId: enrollment.id,
      userId: USERS.moussa,
      amount: 50000,
      status: 'pending',
      declaredAt: new Date().toISOString(),
      lines: [
        { installmentId: await f.installmentOf(enrollment.id, '2026-03-05'), amount: 25000, state: 'proposed' },
        { installmentId: await f.installmentOf(enrollment.id, '2026-04-05'), amount: 25000, state: 'proposed' },
      ],
    });
    expect((await review(paymentId, 'validate')).status).toBe(200);
    const { reviewed_at: reviewedAt } = (
      await f.h.superuser('SELECT reviewed_at FROM payments WHERE id = $1', [paymentId])
    ).rows[0] as { reviewed_at: Date };
    return { paymentId, reviewedAt, after: new Date(reviewedAt.getTime() + REVERT_WINDOW_MS + 2 * MINUTE) };
  };

  beforeAll(async () => {
    [minio, gotenberg] = await Promise.all([startMinio(), startFakeGotenberg()]);
    const storage = {
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY_ID: minio.accessKeyId,
      S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
    };
    f = await startLedgerFixture(storage);
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
    fatou = await f.login('subscriber', 'fatou@test.cotiz.app');
  });

  afterAll(async () => {
    await worker.close();
    await f.stop();
    await Promise.all([minio.stop(), gotenberg.close()]);
  });

  beforeEach(async () => {
    await f.resetLedger();
    await f.h.superuser(`DELETE FROM files WHERE purpose = 'receipt_pdf'`);
  });

  it('avant la fin du délai d’annulation : rien produit, repris à son terme', async () => {
    const { paymentId, reviewedAt } = await validated();
    const before = gotenberg.requests.length;
    const result = await generate(paymentId, new Date(reviewedAt.getTime() + 5 * MINUTE));
    expect(result.retryAt?.getTime()).toBe(reviewedAt.getTime() + REVERT_WINDOW_MS + MINUTE);
    // Délai et marge inclus : à 10 min, puis à 11 min pile, encore trop tôt (horloges de l'api et du worker).
    expect((await generate(paymentId, new Date(reviewedAt.getTime() + REVERT_WINDOW_MS))).retryAt).toBeDefined();
    expect(
      (await generate(paymentId, new Date(reviewedAt.getTime() + REVERT_WINDOW_MS + MINUTE))).retryAt,
    ).toBeDefined();
    expect(gotenberg.requests.length).toBe(before);
    expect((await receiptOf(paymentId))?.file_id).toBeNull();
    expect((await detail(paymentId)).receiptFileId).toBeNull();
  });

  it('après le délai : reçu produit dans cotiz-legal, au souscripteur, servi par me.payment et fl.get', async () => {
    const { paymentId, after } = await validated();
    expect(await generate(paymentId, after)).toEqual({});
    const receipt = await receiptOf(paymentId);
    expect(receipt).toMatchObject({
      purpose: 'receipt_pdf',
      bucket: 'cotiz-legal',
      scan_status: 'clean',
      owner: USERS.moussa,
      object_key: `${A.id}/receipt_pdf/${receipt?.file_id ?? ''}.pdf`,
    });
    const html = gotenberg.requests.at(-1)?.html ?? '';
    for (const text of ['Reçu de paiement', 'Entraide Yopougon', 'Moussa', 'Échéance du 5 mars 2026', '50\u202f000']) {
      expect(html).toContain(text);
    }
    const fileId = (await detail(paymentId)).receiptFileId;
    expect(fileId).toBe(receipt?.file_id);
    const read = await location(`/files/${fileId ?? ''}`, f.tokens.moussa);
    expect(read.status).toBe(302);
    expect(read.location).toContain('cotiz-legal');
    // Les gestionnaires de l'association le lisent aussi (as.file).
    expect((await location(`/associations/${A.id}/files/${fileId ?? ''}`, f.tokens.awa)).status).toBe(302);
  });

  it('rejeu et passages simultanés : un seul reçu, jamais rendu au rejeu', async () => {
    const { paymentId, after } = await validated();
    // Deux passages simultanés peuvent rendre chacun (PDF encore en attente) : un seul est écrit (storeLegalPdf).
    await Promise.all([generate(paymentId, after), generate(paymentId, after)]);
    const rendered = gotenberg.requests.length;
    await generate(paymentId, after);
    expect(gotenberg.requests.length).toBe(rendered);
    expect((await receiptOf(paymentId))?.scan_status).toBe('clean');
    const { rowCount } = await f.h.superuser(`SELECT 1 FROM files WHERE purpose = 'receipt_pdf'`);
    expect(rowCount).toBe(1);
  });

  it('validation annulée dans les 10 minutes : aucun reçu', async () => {
    const { paymentId, after } = await validated();
    expect((await review(paymentId, 'revert-validation')).status).toBe(200);
    const before = gotenberg.requests.length;
    expect(await generate(paymentId, after)).toEqual({});
    expect(gotenberg.requests.length).toBe(before);
    expect((await receiptOf(paymentId))?.file_id).toBeNull();
    expect((await f.h.superuser(`SELECT 1 FROM files WHERE purpose = 'receipt_pdf'`)).rowCount).toBe(0);
  });

  it('isolation : autre souscripteur, autre association, paiement demandé dans un autre contexte', async () => {
    const { paymentId, after } = await validated();
    await generate(paymentId, after);
    const fileId = (await receiptOf(paymentId))?.file_id ?? '';
    expect((await location(`/files/${fileId}`, fatou)).status).toBe(404);
    expect((await location(`/associations/${B.id}/files/${fileId}`, f.tokens.koffi)).status).toBe(404);
    // Paiement de A demandé dans le contexte de B : introuvable, rien produit.
    const before = gotenberg.requests.length;
    expect(await generate(paymentId, after, B.id)).toEqual({});
    expect(gotenberg.requests.length).toBe(before);
  });

  it('payments_guard : reçu posé une seule fois, et seulement sur un paiement validé', async () => {
    const { paymentId, after } = await validated();
    await generate(paymentId, after);
    await expect(
      f.h.superuser(`UPDATE payments SET receipt_file_id = NULL WHERE id = $1`, [paymentId]),
    ).rejects.toThrow(/forbidden_update/);
    const enrollment = await f.enrollByApi({
      phone: '+2250711223344',
      firstName: 'Kofi',
      lastName: 'Annan',
      startsFrom: '2026-03-01',
    });
    const pending = await f.record({
      enrollmentId: enrollment.id,
      userId: await f.userOf(enrollment.id),
      amount: 25000,
      status: 'pending',
      declaredAt: new Date().toISOString(),
      lines: [{ installmentId: await f.installmentOf(enrollment.id, '2026-03-05'), amount: 25000, state: 'proposed' }],
    });
    const fileId = (await receiptOf(paymentId))?.file_id ?? '';
    await expect(
      f.h.superuser(`UPDATE payments SET receipt_file_id = $2 WHERE id = $1`, [pending, fileId]),
    ).rejects.toThrow(/forbidden_update/);
  });

  it('payment.validated → un job receipt-pdf par événement, différé au-delà du délai d’annulation', async () => {
    const queue = new Queue(QUEUES.documents.name, {
      connection: redisConnection(f.redis.getConnectionUrl()),
      prefix: REDIS_PREFIX,
    });
    try {
      const paymentId = crypto.randomUUID();
      const envelope: EventEnvelope = {
        id: '2001',
        type: 'payment.validated',
        version: 1,
        occurredAt: new Date().toISOString(),
        associationId: A.id,
        actorUserId: USERS.awa,
        aggregate: { type: 'payment', id: paymentId },
        payload: { paymentId, userId: USERS.moussa, amountReceived: 25000, installmentIds: [] },
      };
      const consumer = worker.get(PaymentValidatedConsumer);
      await consumer.handle(envelope);
      await consumer.handle(envelope);
      const job = await queue.getJob('receipt-pdf-2001');
      expect(job?.name).toBe('receipt-pdf');
      expect(job?.data).toMatchObject({ associationId: A.id, paymentId });
      expect(job?.opts.delay).toBe(RECEIPT_DELAY_MS);
      expect(RECEIPT_DELAY_MS).toBeGreaterThan(REVERT_WINDOW_MS);
      expect(await queue.getDelayedCount()).toBe(1);
      // Enveloppe sans association : ignorée.
      await consumer.handle({ ...envelope, id: '2002', associationId: null });
      expect(await queue.getJob('receipt-pdf-2002')).toBeUndefined();
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
