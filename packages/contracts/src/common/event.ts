import { z } from 'zod';
import { EVENTS, EVENT_TYPES, type EventType } from '../generated/event-types.js';
import { Instant, Uuid } from './scalars.js';

/** Clés du payload d'un type d'événement (docs/specs/events.yaml). */
export type EventPayloadKey<T extends EventType> = (typeof EVENTS)[T]['payload'][number];

/** Payload d'un type d'événement : exactement les clés de events.yaml, valeurs JSON. */
export type EventPayload<T extends EventType> = Record<EventPayloadKey<T>, unknown>;

/** `true` si le payload porte exactement les clés déclarées pour ce type, ni plus ni moins. */
export function hasEventPayloadKeys(type: EventType, payload: Record<string, unknown>): boolean {
  const expected: readonly string[] = EVENTS[type].payload;
  const actual = Object.keys(payload);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(payload, key));
}

/**
 * Enveloppe d'un événement de domaine (architecture/05-events-jobs.md), telle que relayée par l'outbox vers BullMQ.
 * `id` : `outbox_events.id` (bigserial) en chaîne décimale, base de la déduplication `{id}:{consumer}`.
 */
export const EventEnvelope = z
  .object({
    id: z.string().regex(/^[1-9][0-9]*$/),
    type: z.enum(EVENT_TYPES),
    version: z.int().min(1),
    occurredAt: Instant,
    associationId: Uuid.nullable(),
    actorUserId: Uuid.nullable(),
    aggregate: z.object({ type: z.string().min(1), id: Uuid }),
    payload: z.record(z.string(), z.unknown()),
  })
  .refine((e) => hasEventPayloadKeys(e.type, e.payload), {
    message: 'payload : clés différentes de docs/specs/events.yaml',
    path: ['payload'],
  });
export type EventEnvelope = z.infer<typeof EventEnvelope>;
