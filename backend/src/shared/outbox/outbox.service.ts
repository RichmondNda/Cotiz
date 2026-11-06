import { Injectable } from '@nestjs/common';
import { EVENTS, type EventPayload, type EventType, hasEventPayloadKeys } from '@cotiz/contracts';
import { outboxEvents } from '@cotiz/db';
import { currentContext, type Tx } from '../tenant-context/index.js';

/** Événement de domaine à publier : un type de docs/specs/events.yaml et exactement les clés de son payload. */
export type DomainEvent = {
  [T in EventType]: {
    type: T;
    /** Association concernée ; `null` pour un événement de plateforme. */
    associationId: string | null;
    /** Auteur de l'action ; `null` pour une tâche système. */
    actorUserId: string | null;
    aggregate: { type: string; id: string };
    payload: EventPayload<T>;
  };
}[EventType];

/**
 * Patron outbox (architecture/05) : l'événement s'écrit dans la transaction du cas d'usage. Annulée, elle n'en laisse
 * aucun ; validée, le relais du worker le publiera. Aucun effet de bord ici.
 */
@Injectable()
export class OutboxService {
  async publish(tx: Tx, event: DomainEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown>;
    if (!hasEventPayloadKeys(event.type, payload)) {
      throw new Error(
        `outbox : payload de ${event.type} différent de docs/specs/events.yaml (attendu : ${EVENTS[event.type].payload.join(', ')})`,
      );
    }
    // La base accepte toute association (politique append) : le consommateur s'exécutera dans le contexte de
    // l'association de l'événement, elle ne peut donc venir que du contexte en espace association.
    const context = currentContext();
    // Route de l'espace association sans {aid} (`/me/…`) : aucune association dans le contexte, l'événement n'en porte pas.
    if (context?.space === 'association' && event.associationId !== (context.associationId ?? null)) {
      throw new Error(`outbox : ${event.type} doit porter l'association du contexte`);
    }
    if ('associationId' in payload && payload.associationId !== event.associationId) {
      throw new Error(`outbox : ${event.type}, payload.associationId différent de l'association de l'événement`);
    }
    await tx.insert(outboxEvents).values({
      associationId: event.associationId,
      actorUserId: event.actorUserId,
      eventType: event.type,
      eventVersion: EVENTS[event.type].version,
      aggregateType: event.aggregate.type,
      aggregateId: event.aggregate.id,
      payload,
    });
  }
}
