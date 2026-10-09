import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service.js';

/** Publication d'événements dans la transaction du cas d'usage (api et worker). */
@Global()
@Module({ providers: [OutboxService], exports: [OutboxService] })
export class OutboxModule {}
