import { type PublicPlan, PublicPlanList } from '@cotiz/contracts';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { REDIS_PREFIX } from '../../../shared/queues/index.js';

/** Plans publics en cache (endpoints.yaml, pub.plans : 1 h), invalidés par plan.updated (consommateur du worker). */
export const PUBLIC_PLANS_CACHE_KEY = `${REDIS_PREFIX}:cache:pub.plans`;
/**
 * Génération du cache, incrémentée à chaque invalidation : une liste lue en base avant une invalidation porte
 * l'ancienne génération et n'est jamais servie ensuite (une lecture lente ne republie pas un plan archivé).
 */
export const PUBLIC_PLANS_GENERATION_KEY = `${REDIS_PREFIX}:cache:pub.plans:generation`;
export const PUBLIC_PLANS_TTL_SECONDS = 3600;

const Cached = PublicPlanList.extend({ generation: z.string() });

/** Génération courante (`'0'` si jamais invalidé) ; Redis absent : `null` (aucun cache). */
async function generation(redis: Redis): Promise<string | null> {
  try {
    return (await redis.get(PUBLIC_PLANS_GENERATION_KEY)) ?? '0';
  } catch {
    return null;
  }
}

/**
 * Lu en cache s'il est de la génération courante, revalidé par le contrat. Sinon `{ items: null }` et la génération
 * lue, à repasser à `writePublicPlans` (lecture en base entre les deux).
 */
export async function readPublicPlans(
  redis: Redis,
): Promise<{ items: PublicPlan[] | null; generation: string | null }> {
  try {
    const [raw, current] = await redis.mget(PUBLIC_PLANS_CACHE_KEY, PUBLIC_PLANS_GENERATION_KEY);
    const gen = current ?? '0';
    if (raw === null || raw === undefined) return { items: null, generation: gen };
    const parsed = Cached.safeParse(JSON.parse(raw));
    return { items: parsed.success && parsed.data.generation === gen ? parsed.data.items : null, generation: gen };
  } catch {
    return { items: null, generation: await generation(redis) };
  }
}

/** Mise en cache au mieux, sous la génération lue avant la lecture en base ; une panne de Redis n'échoue jamais. */
export async function writePublicPlans(redis: Redis, items: PublicPlan[], gen: string | null): Promise<void> {
  if (gen === null) return;
  try {
    await redis.set(PUBLIC_PLANS_CACHE_KEY, JSON.stringify({ items, generation: gen }), 'EX', PUBLIC_PLANS_TTL_SECONDS);
  } catch {
    // Prochaine lecture en base.
  }
}

/** Invalidation (worker) : nouvelle génération, puis cache retiré. */
export async function invalidatePublicPlans(redis: Redis): Promise<void> {
  await redis.incr(PUBLIC_PLANS_GENERATION_KEY);
  await redis.del(PUBLIC_PLANS_CACHE_KEY);
}
