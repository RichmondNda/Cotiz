import { Module } from '@nestjs/common';
import { PublicPlansCacheConsumer } from './events/public-plans-cache.consumer.js';

/** Partie worker du module billing : invalidation du cache des plans publics. */
@Module({ providers: [PublicPlansCacheConsumer] })
export class BillingWorkerModule {}
