import { Module } from '@nestjs/common';
import { QuotaLimitsCacheConsumer } from './events/quota-limits-cache.consumer.js';
import { PublicPlansCacheConsumer } from './events/public-plans-cache.consumer.js';

/** Partie worker du module billing : invalidation des caches des plans publics et des limites de quotas. */
@Module({ providers: [PublicPlansCacheConsumer, QuotaLimitsCacheConsumer] })
export class BillingWorkerModule {}
