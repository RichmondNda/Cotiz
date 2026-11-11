import { createECDH, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import { createServer, type Server } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import webpush from 'web-push';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { NotificationRouter, runAfterCommit } from '../../src/modules/notifications/application/notification-router.js';
import { PurgePushSubscriptionsUseCase } from '../../src/modules/notifications/application/purge-push-subscriptions.use-case.js';
import { PushRetryableError, SendPushUseCase } from '../../src/modules/notifications/application/send-push.use-case.js';
import type { Recipient, RenderedMessage } from '../../src/modules/notifications/domain/channel.js';
import type { PushJob } from '../../src/modules/notifications/infra/push-queue.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../src/shared/queues/index.js';
import { TenantDatabase } from '../../src/shared/tenant-context/index.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type MembersFixture, startMembersFixture } from './members.fixture.js';

/**
 * Lot 4.2 · étape 3 : canal push. Le routeur écrit une ligne `deliveries` par destinataire abonné (dans la transaction
 * du consommateur), met l'envoi en file `notify-push` après le COMMIT (différé pendant les heures calmes pour un type
 * non urgent) ; le worker chiffre (RFC 8291) et poste au service de push de chaque appareil actif. 404/410 :
 * désabonné ; autre échec : compté, désabonné au 5e, job repris. Faux service de push local en https (certificat
 * autosigné, vérification TLS coupée dans ce seul processus de test).
 */

interface Received {
  path: string;
  headers: IncomingHttpHeaders;
  bytes: number;
}

/** Message urgent (envoyé tout de suite, quelle que soit l'heure) et non urgent. */
const urgentMsg: RenderedMessage = {
  type: 'password_reset.requested',
  title: 'Demande de réinitialisation',
  body: 'Moussa demande un nouveau code.',
  actionUrl: '/asso/souscripteurs/reinitialisations',
};
const normalMsg: RenderedMessage = {
  type: 'payment.validated',
  title: 'Paiement validé',
  body: 'Votre paiement de 25 000 F est validé.',
  actionUrl: '/projets/x',
};
const moussa: Recipient = { userId: USERS.moussa, associationId: A.id, audience: 'subscriber' };

describe('canal push (Web Push)', () => {
  let f: MembersFixture;
  let worker: INestApplicationContext;
  let router: NotificationRouter;
  let db: TenantDatabase;
  let queue: Queue;
  let server: Server;
  let pushBase: string;
  const received: Received[] = [];
  /** Réponse du faux service par chemin (201 par défaut). */
  const statusOf = new Map<string, number>();
  let seq = 0;

  /** Appareil abonné, comme le ferait me.push : clé ECDH P-256 et secret propres à l'appareil. */
  const device = async (userId: string, name: string) => {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const id = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        userId,
        `${pushBase}/${name}`,
        ecdh.getPublicKey().toString('base64url'),
        randomBytes(16).toString('base64url'),
      ],
    );
    return id;
  };
  /** Comme le consommateur : routeur dans une transaction system, puis les suites après le COMMIT. */
  const dispatch = async (msg: RenderedMessage, recipients: Recipient[], dedupeBase = `evt-${String(++seq)}`) => {
    const deliveries = await db.withTenantContext({ space: 'system' }, () =>
      router.dispatch(msg, recipients, { dedupeBase }),
    );
    await runAfterCommit(deliveries);
    return deliveries;
  };
  const until = async (predicate: () => boolean | Promise<boolean>, ms = 5_000) => {
    const deadline = Date.now() + ms;
    while (!(await predicate())) {
      if (Date.now() > deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return true;
  };
  const deliveryRows = async () =>
    (
      await f.h.superuser(
        `SELECT user_id, association_id, notification_id, channel, provider, recipient_masked, status, attempts,
                last_error, sent_at FROM deliveries ORDER BY created_at`,
      )
    ).rows as {
      user_id: string;
      notification_id: string | null;
      provider: string;
      recipient_masked: string;
      status: string;
      attempts: number;
      last_error: string | null;
      sent_at: Date | null;
    }[];
  const subscription = async (id: string) =>
    (
      (
        await f.h.superuser(`SELECT failed_count, revoked_at, last_success_at FROM push_subscriptions WHERE id = $1`, [
          id,
        ])
      ).rows as { failed_count: number; revoked_at: Date | null; last_success_at: Date | null }[]
    )[0];

  let tlsCheck: string | undefined;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cotiz-push-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-keyout',
        join(dir, 'key.pem'),
        '-out',
        join(dir, 'cert.pem'),
      ],
      { stdio: 'ignore' },
    );
    const tls = { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
    rmSync(dir, { recursive: true });
    tlsCheck = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    server = createServer(tls, (req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const path = (req.url ?? '/').slice(1);
        received.push({ path, headers: req.headers, bytes: Buffer.concat(chunks).length });
        res.writeHead(statusOf.get(path) ?? 201).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    pushBase = `https://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

    const vapid = webpush.generateVAPIDKeys();
    f = await startMembersFixture();
    worker = await NestFactory.createApplicationContext(
      WorkerModule.register(
        loadConfig({
          NODE_ENV: 'test',
          DATABASE_URL: f.h.db.urlFor('cotiz_app'),
          REDIS_URL: f.redis.getConnectionUrl(),
          S3_ENDPOINT: 'http://127.0.0.1:1',
          OUTBOX_RELAY_INTERVAL_MS: '0',
          VAPID_PUBLIC_KEY: vapid.publicKey,
          VAPID_PRIVATE_KEY: vapid.privateKey,
          WEB_PUSH_HOSTS: '127.0.0.1',
        }),
      ),
      { logger: false },
    );
    await worker.init();
    router = worker.get(NotificationRouter);
    db = worker.get(TenantDatabase);
    queue = new Queue(QUEUES['notify-push'].name, {
      connection: redisConnection(f.redis.getConnectionUrl()),
      prefix: REDIS_PREFIX,
    });
  });

  afterAll(async () => {
    vi.useRealTimers();
    await queue.close();
    await worker.close();
    await f.stop();
    await new Promise((resolve) => server.close(resolve));
    if (tlsCheck === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = tlsCheck;
  });

  beforeEach(async () => {
    vi.useRealTimers();
    received.splice(0);
    statusOf.clear();
    await queue.obliterate({ force: true });
    await f.h.superuser('DELETE FROM deliveries; DELETE FROM notifications; DELETE FROM push_subscriptions');
  });

  it('appareil abonné : une ligne deliveries reliée à la cloche, le message chiffré arrive, envoi « sent »', async () => {
    const sub = await device(USERS.moussa, 'moussa-1');
    const results = await dispatch(urgentMsg, [moussa]);
    expect(results.map((r) => [r.channel, r.status])).toEqual([
      ['in_app', 'created'],
      ['push', 'queued'],
    ]);
    expect(await until(() => received.length === 1)).toBe(true);
    const [request] = received;
    expect(request?.path).toBe('moussa-1');
    // Chiffré pour l'appareil (aes128gcm), signé VAPID avec la clé publique de Cotiz ; jamais le texte en clair.
    expect(request?.headers['content-encoding']).toBe('aes128gcm');
    expect(request?.headers.authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    expect(request?.headers.urgency).toBe('high');
    expect(request?.headers.ttl).toBe(String(24 * 3600));
    expect(request?.bytes).toBeGreaterThan(urgentMsg.body.length);

    expect(await until(async () => (await deliveryRows())[0]?.status === 'sent')).toBe(true);
    const [row] = await deliveryRows();
    expect(row).toMatchObject({
      user_id: USERS.moussa,
      notification_id: results[0]?.notificationId,
      provider: 'webpush',
      recipient_masked: '1 appareil',
      attempts: 1,
      last_error: null,
    });
    // Jamais l'URL de l'appareil dans la ligne d'envoi.
    expect(JSON.stringify(row)).not.toContain('moussa-1');
    expect((await subscription(sub))?.last_success_at).toBeInstanceOf(Date);
  });

  it('chaque appareil actif de la personne reçoit, jamais celui d’une autre personne ni un appareil désactivé', async () => {
    await device(USERS.moussa, 'moussa-1');
    await device(USERS.moussa, 'moussa-2');
    const revoked = await device(USERS.moussa, 'moussa-ancien');
    await f.h.superuser(`UPDATE push_subscriptions SET revoked_at = now() WHERE id = $1`, [revoked]);
    await device(USERS.fatou, 'fatou-1');
    await dispatch(urgentMsg, [moussa]);
    expect(await until(async () => (await deliveryRows())[0]?.status === 'sent')).toBe(true);
    expect(received.map((r) => r.path).sort()).toEqual(['moussa-1', 'moussa-2']);
    expect((await deliveryRows())[0]?.recipient_masked).toBe('2 appareils');
  });

  it('aucun appareil : pas de ligne deliveries, rien en file (la cloche suffit)', async () => {
    const results = await dispatch(urgentMsg, [moussa]);
    expect(results.map((r) => r.status)).toEqual(['created', 'skipped']);
    expect(await deliveryRows()).toEqual([]);
    const counts = await queue.getJobCounts('waiting', 'delayed', 'active', 'completed');
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('événement rejoué : une seule ligne deliveries et un seul envoi', async () => {
    await device(USERS.moussa, 'moussa-1');
    await dispatch(urgentMsg, [moussa], 'evt-rejoue');
    await dispatch(urgentMsg, [moussa], 'evt-rejoue');
    expect(await until(() => received.length >= 1)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(received).toHaveLength(1);
    expect(await deliveryRows()).toHaveLength(1);
  });

  it('heures calmes : à 22 h à Abidjan, un push non urgent est différé à 8 h ; un urgent part tout de suite', async () => {
    await device(USERS.moussa, 'moussa-1');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T22:00:00Z'));
    await dispatch(normalMsg, [moussa], 'evt-nuit');
    vi.useRealTimers();
    const [job] = await queue.getJobs(['delayed']);
    expect(job?.opts.delay).toBe(10 * 3_600_000);
    expect(received).toEqual([]);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T22:00:00Z'));
    await dispatch(urgentMsg, [moussa], 'evt-urgent');
    vi.useRealTimers();
    expect(await until(() => received.length === 1)).toBe(true);
  });

  it('404/410 : l’appareil est désabonné, l’envoi échoue sans reprise', async () => {
    const sub = await device(USERS.moussa, 'moussa-perdu');
    statusOf.set('moussa-perdu', 410);
    await dispatch(urgentMsg, [moussa]);
    expect(await until(async () => (await deliveryRows())[0]?.status === 'failed')).toBe(true);
    expect((await deliveryRows())[0]).toMatchObject({ attempts: 1, last_error: 'gone' });
    expect((await subscription(sub))?.revoked_at).toBeInstanceOf(Date);
    expect(received).toHaveLength(1);
  });

  describe('échec passager (service de push en erreur 500)', () => {
    const job = (deliveryId: string): PushJob => ({
      deliveryId,
      userId: USERS.moussa,
      urgent: true,
      payload: { title: 't', body: 'b', url: null, tag: 'payment.validated' },
    });
    const queued = async () => {
      const id = crypto.randomUUID();
      await f.h.superuser(
        `INSERT INTO deliveries (id, user_id, association_id, channel, provider, recipient_masked)
         VALUES ($1, $2, $3, 'push', 'webpush', '1 appareil')`,
        [id, USERS.moussa, A.id],
      );
      return id;
    };

    it('compté et repris ; à la dernière tentative : « failed » ; un appareil servi suffit, pas de reprise', async () => {
      const sendPush = worker.get(SendPushUseCase);
      const sub = await device(USERS.moussa, 'moussa-panne');
      statusOf.set('moussa-panne', 500);
      const id = await queued();
      await expect(sendPush.execute(job(id), { final: false })).rejects.toBeInstanceOf(PushRetryableError);
      expect((await deliveryRows())[0]).toMatchObject({ status: 'queued', attempts: 1, last_error: 'http_500' });
      expect((await subscription(sub))?.failed_count).toBe(1);

      await sendPush.execute(job(id), { final: true });
      expect((await deliveryRows())[0]).toMatchObject({ status: 'failed', attempts: 2, last_error: 'http_500' });
      // Déjà traité : un job rejoué ne renvoie rien.
      await sendPush.execute(job(id), { final: false });
      expect(received).toHaveLength(2);

      await f.h.superuser('DELETE FROM deliveries');
      await device(USERS.moussa, 'moussa-ok');
      const other = await queued();
      await sendPush.execute(job(other), { final: false });
      expect((await deliveryRows())[0]).toMatchObject({ status: 'sent' });
    });

    it('5e échec consécutif : l’appareil est désabonné ; un succès remet le compteur à zéro', async () => {
      const sendPush = worker.get(SendPushUseCase);
      const sub = await device(USERS.moussa, 'moussa-panne');
      await f.h.superuser(`UPDATE push_subscriptions SET failed_count = 3 WHERE id = $1`, [sub]);
      statusOf.set('moussa-panne', 500);
      await sendPush.execute(job(await queued()), { final: true });
      expect(await subscription(sub)).toMatchObject({ failed_count: 4, revoked_at: null });
      statusOf.delete('moussa-panne');
      await sendPush.execute(job(await queued()), { final: true });
      expect(await subscription(sub)).toMatchObject({ failed_count: 0, revoked_at: null });
      await f.h.superuser(`UPDATE push_subscriptions SET failed_count = 4 WHERE id = $1`, [sub]);
      statusOf.set('moussa-panne', 500);
      await sendPush.execute(job(await queued()), { final: true });
      expect((await subscription(sub))?.revoked_at).toBeInstanceOf(Date);
    });

    it('envoi d’une autre personne : le job ne sert que la personne de la ligne deliveries', async () => {
      const sendPush = worker.get(SendPushUseCase);
      await device(USERS.fatou, 'fatou-1');
      const id = await queued();
      // Job falsifié : la ligne est à Moussa, le job dit Fatou.
      await sendPush.execute({ ...job(id), userId: USERS.fatou }, { final: true });
      expect(received).toEqual([]);
      expect((await deliveryRows())[0]?.status).toBe('queued');
    });
  });

  it('push.cleanup : supprime les abonnements désactivés depuis plus de 30 jours, garde les autres', async () => {
    const old = await device(USERS.moussa, 'ancien');
    const recent = await device(USERS.moussa, 'recent');
    const active = await device(USERS.fatou, 'actif');
    await f.h.superuser(`UPDATE push_subscriptions SET revoked_at = now() - interval '31 days' WHERE id = $1`, [old]);
    await f.h.superuser(`UPDATE push_subscriptions SET revoked_at = now() - interval '29 days' WHERE id = $1`, [
      recent,
    ]);
    expect(await worker.get(PurgePushSubscriptionsUseCase).execute(new Date())).toBe(1);
    const left = (await f.h.superuser(`SELECT id FROM push_subscriptions ORDER BY id`)).rows as { id: string }[];
    expect(left.map((r) => r.id).sort()).toEqual([recent, active].sort());
  });

  it('association B : envoi au seul destinataire, sur son appareil', async () => {
    await device(USERS.moussa, 'moussa-1');
    await device(USERS.fatou, 'fatou-1');
    await dispatch(urgentMsg, [{ userId: USERS.fatou, associationId: B.id, audience: 'subscriber' }]);
    expect(await until(() => received.length === 1)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received.map((r) => r.path)).toEqual(['fatou-1']);
  });
});
