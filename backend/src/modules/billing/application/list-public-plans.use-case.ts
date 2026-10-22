import { Injectable } from '@nestjs/common';
import type { PublicPlan } from '@cotiz/contracts';
import { RedisClient } from '../../../shared/redis/redis.module.js';
import { readPublicPlans, writePublicPlans } from '../infra/public-plans-cache.js';
import { activePlans, toPublicPlan } from './plan-records.js';

/** pub.plans : plans actifs (landing, formulaire de demande), en cache 1 h ; un plan archivé n'y figure plus. */
@Injectable()
export class ListPublicPlansUseCase {
  constructor(private readonly redis: RedisClient) {}

  async execute(): Promise<{ items: PublicPlan[] }> {
    const cached = await readPublicPlans(this.redis.redis);
    if (cached.items) return { items: cached.items };
    const items = (await activePlans()).map(toPublicPlan);
    await writePublicPlans(this.redis.redis, items, cached.generation);
    return { items };
  }
}
