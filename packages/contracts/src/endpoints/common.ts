import { z } from 'zod';
import { FilePurpose, FileScanStatus } from '../common/enums.js';
import { listOf, ListQuery } from '../common/list.js';
import { IdParams } from '../common/params.js';
import { Instant, Uuid } from '../common/scalars.js';
import { defineEndpoint, noFlags } from '../registry.js';

// Endpoints communs à tous les espaces : notifications, Web Push, fichiers ; réception du prestataire de paiement.

// ---------------------------------------------------------------- Notifications

export const Notification = z
  .object({
    id: Uuid,
    /** Type d'événement (`payment.validated`, `installment.late`…). */
    type: z.string(),
    title: z.string(),
    body: z.string(),
    /** Route de l'écran d'action ouvert au clic. */
    actionUrl: z.string().nullable(),
    data: z.record(z.string(), z.unknown()),
    associationId: Uuid.nullable(),
    readAt: Instant.nullable(),
    createdAt: Instant,
  })
  .meta({ id: 'Notification' });
export type Notification = z.infer<typeof Notification>;

export const ntList = defineEndpoint({
  id: 'nt.list',
  space: 'common',
  permission: 'authenticated',
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/me/notifications',
      request: { query: ListQuery.extend({ unread: z.stringbool().optional(), type: z.string().optional() }) },
      response: { status: 200, body: listOf(Notification) },
    },
    unreadCount: {
      method: 'GET',
      path: '/api/v1/me/notifications/unread-count',
      request: {},
      response: { status: 200, body: z.object({ count: z.int().nonnegative() }) },
    },
  },
});

export const ntRead = defineEndpoint({
  id: 'nt.read',
  space: 'common',
  permission: 'authenticated',
  errors: [],
  flags: noFlags,
  operations: {
    read: {
      method: 'POST',
      path: '/api/v1/me/notifications/{id}/read',
      request: { params: IdParams },
      response: { status: 200, body: Notification },
    },
    readAll: {
      method: 'POST',
      path: '/api/v1/me/notifications/read-all',
      request: {},
      response: { status: 200, body: z.object({ updated: z.int().nonnegative() }) },
    },
  },
});

export const ntStream = defineEndpoint({
  id: 'nt.stream',
  space: 'common',
  permission: 'authenticated',
  errors: [],
  flags: noFlags,
  operations: {
    /** Flux SSE : un événement `notification` par message, reprise avec `Last-Event-ID`. */
    stream: {
      method: 'GET',
      path: '/api/v1/me/notifications/stream',
      request: {},
      response: { status: 200, body: Notification, contentType: 'text/event-stream' },
    },
  },
});

// ---------------------------------------------------------------- Web Push

export const PushSubscriptionInput = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export const mePush = defineEndpoint({
  id: 'me.push',
  space: 'common',
  permission: 'authenticated',
  errors: ['validation_failed'],
  flags: noFlags,
  operations: {
    vapidKey: {
      method: 'GET',
      path: '/api/v1/public/push/vapid-public-key',
      request: {},
      response: { status: 200, body: z.object({ publicKey: z.string().min(1) }) },
    },
    subscribe: {
      method: 'POST',
      path: '/api/v1/me/push-subscriptions',
      request: { body: PushSubscriptionInput },
      response: { status: 201, body: z.object({ id: Uuid, createdAt: Instant }) },
    },
    unsubscribe: {
      method: 'DELETE',
      path: '/api/v1/me/push-subscriptions/{id}',
      request: { params: IdParams },
      response: { status: 204 },
    },
  },
});

// ---------------------------------------------------------------- Fichiers

export const UploadRequest = z.object({
  purpose: FilePurpose,
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.int().min(1),
});

/** URL de dépôt présignée (MinIO) : le fichier ne transite pas par l'api. */
export const UploadTicket = z.object({
  fileId: Uuid,
  uploadUrl: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: Instant,
});

export const StoredFile = z.object({
  id: Uuid,
  purpose: FilePurpose,
  mimeType: z.string(),
  sizeBytes: z.int().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** Analyse du worker (type réel, antivirus, EXIF) : `pending` puis `clean` ou `infected`. */
  scanStatus: FileScanStatus,
  createdAt: Instant,
});

export const flUpload = defineEndpoint({
  id: 'fl.upload',
  space: 'common',
  permission: 'authenticated',
  errors: ['file_too_large', 'file_type_not_allowed', 'file_not_clean'],
  flags: { ...noFlags, rateLimited: true },
  operations: {
    create: {
      method: 'POST',
      path: '/api/v1/uploads',
      request: { body: UploadRequest },
      response: { status: 201, body: UploadTicket },
    },
    /** Confirme le dépôt ; l'analyse se poursuit dans le worker. */
    complete: {
      method: 'POST',
      path: '/api/v1/uploads/{id}/complete',
      request: { params: IdParams },
      response: { status: 202, body: StoredFile },
    },
  },
});

export const flGet = defineEndpoint({
  id: 'fl.get',
  space: 'common',
  permission: 'authenticated',
  errors: ['not_found'],
  flags: { ...noFlags, audited: true },
  operations: {
    /** Redirection 302 vers une URL signée valable 5 min. */
    get: { method: 'GET', path: '/api/v1/files/{id}', request: { params: IdParams }, response: { status: 302 } },
  },
});

// ---------------------------------------------------------------- Prestataire de paiement (lot 6.3, option)

export const pspWebhook = defineEndpoint({
  id: 'psp.webhook',
  space: 'system',
  permission: 'public',
  errors: ['invalid_signature'],
  flags: { ...noFlags, audited: true },
  operations: {
    /** Corps propre au prestataire, signature vérifiée avant toute lecture ; idempotent. */
    receive: {
      method: 'POST',
      path: '/api/v1/webhooks/psp/{provider}',
      request: {
        params: z.object({ provider: z.string().regex(/^[a-z0-9-]+$/) }),
        body: z.record(z.string(), z.unknown()),
      },
      response: { status: 204 },
    },
  },
});
