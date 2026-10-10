import { describe, expect, it } from 'vitest';
import { EventEnvelope, hasEventPayloadKeys } from './event.js';

const envelope = {
  id: '42',
  type: 'file.uploaded',
  version: 1,
  occurredAt: '2026-10-09T08:00:00.000Z',
  associationId: '00000000-0000-7000-8000-00000000a001',
  actorUserId: null,
  aggregate: { type: 'file', id: '00000000-0000-7000-8000-0000000f0001' },
  payload: { fileId: '00000000-0000-7000-8000-0000000f0001', purpose: 'payment_proof' },
};

describe('EventEnvelope', () => {
  it('accepte une enveloppe conforme à events.yaml', () => {
    expect(EventEnvelope.parse(envelope)).toEqual(envelope);
  });

  it.each([
    ['clé manquante', { fileId: envelope.payload.fileId }],
    ['clé en trop', { ...envelope.payload, userId: envelope.payload.fileId }],
  ])('refuse un payload avec une %s', (_case, payload) => {
    expect(EventEnvelope.safeParse({ ...envelope, payload }).success).toBe(false);
  });

  it.each([
    ['type inconnu', { type: 'file.deleted' }],
    ['id non numérique', { id: 'abc' }],
    ['id nul', { id: '0' }],
    ['version 0', { version: 0 }],
    ['acteur non UUID', { actorUserId: 'awa' }],
  ])('refuse un %s', (_case, patch) => {
    expect(EventEnvelope.safeParse({ ...envelope, ...patch }).success).toBe(false);
  });
});

describe('hasEventPayloadKeys', () => {
  it('ne se laisse pas tromper par une clé héritée', () => {
    const inherited = Object.create({ purpose: 'logo' }) as Record<string, unknown>;
    inherited.fileId = 'x';
    inherited.other = 'y';
    expect(hasEventPayloadKeys('file.uploaded', inherited)).toBe(false);
  });
});
