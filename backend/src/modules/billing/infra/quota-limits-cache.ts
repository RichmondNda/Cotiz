import type { Redis } from 'ioredis';
import { z } from 'zod';
import { REDIS_PREFIX } from '../../../shared/queues/index.js';

/**
 * Limites de l'abonnement en cours d'une association, en cache 5 min (architecture/09) ; l'usage n'y est jamais : il
 * est compté en direct. Invalidées par plan.updated (toutes les associations) et subscription.plan_changed (une).
 */
export const QUOTA_LIMITS_TTL_SECONDS = 300;
const PREFIX = `${REDIS_PREFIX}:cache:quotas`;
export const quotaLimitsKey = (associationId: string) => `${PREFIX}:${associationId}`;
/**
 * Générations : globale (plan.updated) et par association (subscription.plan_changed). Des limites lues en base avant
 * une invalidation portent l'ancienne génération et ne sont jamais servies ensuite.
 */
export const QUOTA_LIMITS_GENERATION_KEY = `${PREFIX}:generation`;
const associationGenerationKey = (associationId: string) => `${PREFIX}:${associationId}:generation`;

const Quota = z.int().min(0).nullable();
export const QuotaLimits = z.object({ projects: Quota, subscribers: Quota, managers: Quota });
export type QuotaLimits = z.infer<typeof QuotaLimits>;
const Cached = z.object({ limits: QuotaLimits, generation: z.string() });

/** JSON illisible : `undefined`, refusé par le schéma ; la valeur est alors réécrite sous la génération lue. */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Limites en cache si elles sont des générations courantes, revalidées. Sinon `{ limits: null }` et la génération lue,
 * à repasser à `writeQuotaLimits` (lecture en base entre les deux) ; Redis absent : génération `null` (aucun cache).
 */
export async function readQuotaLimits(
  redis: Redis,
  associationId: string,
): Promise<{ limits: QuotaLimits | null; generation: string | null }> {
  try {
    const [raw, global, own] = await redis.mget(
      quotaLimitsKey(associationId),
      QUOTA_LIMITS_GENERATION_KEY,
      associationGenerationKey(associationId),
    );
    const gen = `${global ?? '0'}:${own ?? '0'}`;
    if (raw === null || raw === undefined) return { limits: null, generation: gen };
    const parsed = Cached.safeParse(parseJson(raw));
    return { limits: parsed.success && parsed.data.generation === gen ? parsed.data.limits : null, generation: gen };
  } catch {
    return { limits: null, generation: null };
  }
}

/** Mise en cache au mieux, sous la génération lue avant la lecture en base ; une panne de Redis n'échoue jamais. */
export async function writeQuotaLimits(
  redis: Redis,
  associationId: string,
  limits: QuotaLimits,
  gen: string | null,
): Promise<void> {
  if (gen === null) return;
  try {
    await redis.set(
      quotaLimitsKey(associationId),
      JSON.stringify({ limits, generation: gen }),
      'EX',
      QUOTA_LIMITS_TTL_SECONDS,
    );
  } catch {
    // Prochaine lecture en base.
  }
}

/** plan.updated (worker) : nouvelle génération globale ; chaque association relit ses limites. */
export async function invalidateAllQuotaLimits(redis: Redis): Promise<void> {
  await redis.incr(QUOTA_LIMITS_GENERATION_KEY);
}

/** subscription.plan_changed (worker) : nouvelle génération de l'association, puis son cache retiré. */
export async function invalidateQuotaLimits(redis: Redis, associationId: string): Promise<void> {
  await redis.incr(associationGenerationKey(associationId));
  await redis.del(quotaLimitsKey(associationId));
}
