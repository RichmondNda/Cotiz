import { Global, Module } from '@nestjs/common';
import { EventConsumers } from './event-consumers.js';
import { EventsProcessor } from './events.processor.js';
import { OutboxModule } from './outbox.module.js';
import { OutboxRelay } from './outbox-relay.js';

/** Processus worker : relais outbox → file events, traitement de la file, registre des consommateurs. */
@Global()
@Module({
  imports: [OutboxModule],
  providers: [EventConsumers, EventsProcessor, OutboxRelay],
  exports: [EventConsumers, EventsProcessor, OutboxRelay],
})
export class OutboxWorkerModule {}

export { EventsProcessor } from './events.processor.js';
export { OutboxRelay } from './outbox-relay.js';
