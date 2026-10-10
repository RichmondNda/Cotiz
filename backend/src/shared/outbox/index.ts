// Patron outbox (architecture/05) : publication dans la transaction du cas d'usage (api et worker) et abonnement
// des consommateurs. Relais et traitement de la file : ./worker.ts, réservé au processus worker.
export { type EventConsumer, EventConsumers } from './event-consumers.js';
export { OutboxModule } from './outbox.module.js';
export { type DomainEvent, OutboxService } from './outbox.service.js';
