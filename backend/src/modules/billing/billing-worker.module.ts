import { Module } from '@nestjs/common';
import { PublicPlansCacheConsumer } from './events/public-plans-cache.consumer.js';

/** Partie worker du module billing : invalidation des caches des plans publics et des limites de quotas. */
@Module({ providers: [PublicPlansCacheConsumer] })
export class BillingWorkerModule {}
