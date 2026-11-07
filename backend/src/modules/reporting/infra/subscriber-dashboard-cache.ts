import { ENDPOINTS } from '@cotiz/contracts';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { REDIS_PREFIX } from '../../../shared/queues/index.js';

/**
 * Tableau de bord souscripteur en cache (architecture/09 : synthèse souscripteur, 30 s), une entrée par personne,
 * invalidée par les événements qui la concernent (consommateur du worker). Même schéma que as.dashboard : une
 * génération par personne, incrémentée à chaque invalidation, de sorte qu'un calcul commencé avant une invalidation
 * n'est jamais servi ensuite.
 */
export const SUBSCRIBER_DASHBOARD_TTL_SECONDS = 30;
/** Durée de vie de la génération d'une personne : bien plus longue que celle de l'entrée. */
const GENERATION_TTL_SECONDS = 86_400;
const SubscriberDashboard = ENDPOINTS['me.dash'].operations.get.response.body;
const key = (userId: string) => `${REDIS_PREFIX}:cache:me.dash:${userId}`;
const generationKey = (userId: string) => `${REDIS_PREFIX}:cache:me.dash:${userId}:generation`;

type Dashboard = z.infer<typeof SubscriberDashboard>;
const Cached = z.object({ dashboard: SubscriberDashboard, generation: z.string() });

/**
 * Lu en cache s'il est de la génération courante, revalidé par le contrat ; sinon `dashboard: null` et la génération
 * lue, à repasser à `writeSubscriberDashboard`. Redis absent : `generation: null` (aucun cache).
 */
export async function readSubscriberDashboard(
  redis: Redis,
  userId: string,
): Promise<{ dashboard: Dashboard | null; generation: string | null }> {
  try {
    const [raw, current] = await redis.mget(key(userId), generationKey(userId));
    const gen = current ?? '0';
    if (raw === null || raw === undefined) return { dashboard: null, generation: gen };
    const parsed = Cached.safeParse(JSON.parse(raw));
    return {
      dashboard: parsed.success && parsed.data.generation === gen ? parsed.data.dashboard : null,
      generation: gen,
    };
  } catch {
    return { dashboard: null, generation: null };
  }
}

/** Mise en cache au mieux, sous la génération lue avant le calcul ; une panne de Redis n'échoue jamais. */
export async function writeSubscriberDashboard(
  redis: Redis,
  userId: string,
  dashboard: Dashboard,
  gen: string | null,
): Promise<void> {
  if (gen === null) return;
  try {
    await redis.set(
      key(userId),
      JSON.stringify({ dashboard, generation: gen }),
      'EX',
      SUBSCRIBER_DASHBOARD_TTL_SECONDS,
    );
  } catch {
    // Prochaine lecture recalculée.
  }
}

/** Invalidation (worker) : nouvelle génération, puis entrée retirée. */
export async function invalidateSubscriberDashboard(redis: Redis, userId: string): Promise<void> {
  await redis.incr(generationKey(userId));
  // Une génération oubliée (expirée) repart de 0 : sans danger, l'entrée qu'elle protégeait expire bien avant.
  await redis.expire(generationKey(userId), GENERATION_TTL_SECONDS);
  await redis.del(key(userId));
}
