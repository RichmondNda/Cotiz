import { Injectable } from '@nestjs/common';
import type { EventEnvelope, EventType } from '@cotiz/contracts';

/**
 * Consommateur d'événements. `handle` s'exécute dans une transaction du contexte de l'événement (`currentTx()`) :
 * association de l'événement, ou espace system pour un événement de plateforme. Il doit être idempotent
 * (architecture/05) : la déduplication `{eventId}:{name}` écarte les doublons, pas un arrêt entre COMMIT et marquage.
 */
export interface EventConsumer {
  /** Stable : il entre dans la clé de déduplication. */
  name: string;
  types: readonly EventType[];
  /**
   * `true` : `handle` est appelé hors transaction et ouvre lui-même les siennes (`withTenantContext`), par exemple lire
   * dans le contexte de l'association puis écrire dans l'espace system (notifications). Il reste idempotent.
   */
  ownTransactions?: boolean;
  handle(event: EventEnvelope): Promise<void>;
}

const NAME = /^[a-z][a-z0-9-]{0,62}$/;

/** Abonnements par type, posés par les modules au démarrage du worker. */
@Injectable()
export class EventConsumers {
  private readonly consumers = new Map<string, EventConsumer>();

  /** Abonne le consommateur ; renvoie de quoi le désabonner. */
  register(consumer: EventConsumer): () => void {
    if (!NAME.test(consumer.name)) throw new Error(`consommateur : nom invalide (${JSON.stringify(consumer.name)})`);
    if (this.consumers.has(consumer.name)) throw new Error(`consommateur déjà enregistré : ${consumer.name}`);
    this.consumers.set(consumer.name, consumer);
    return () => this.consumers.delete(consumer.name);
  }

  for(type: EventType): EventConsumer[] {
    return [...this.consumers.values()].filter((c) => c.types.includes(type));
  }
}
