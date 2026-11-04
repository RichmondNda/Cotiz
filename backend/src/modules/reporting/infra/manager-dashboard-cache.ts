import { ManagerDashboard } from '@cotiz/contracts';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { REDIS_PREFIX } from '../../../shared/queues/index.js';

/**
 * Tableau de bord gestionnaire en cache (architecture/09 : KPI, 60 s), une entrée par association, invalidée par les
 * événements de l'association (consommateur du worker). Même schéma que pub.plans : une génération par association,
 * incrémentée à chaque invalidation, de sorte qu'un calcul commencé avant une invalidation n'est jamais servi ensuite.
 */
export const MANAGER_DASHBOARD_TTL_SECONDS = 60;
const key = (associationId: string) => `${REDIS_PREFIX}:cache:as.dashboard:${associationId}`;
const generationKey = (associationId: string) => `${REDIS_PREFIX}:cache:as.dashboard:${associationId}:generation`;

type Dashboard = z.infer<typeof ManagerDashboard>;
const Cached = z.object({ dashboard: ManagerDashboard, generation: z.string() });

/**
 * Lu en cache s'il est de la génération courante, revalidé par le contrat ; sinon `dashboard: null` et la génération
 * lue, à repasser à `writeManagerDashboard`. Redis absent : `generation: null` (aucun cache).
 */
export async function readManagerDashboard(
  redis: Redis,
  associationId: string,
): Promise<{ dashboard: Dashboard | null; generation: string | null }> {
  try {
    const [raw, current] = await redis.mget(key(associationId), generationKey(associationId));
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
export async function writeManagerDashboard(
  redis: Redis,
  associationId: string,
  dashboard: Dashboard,
  gen: string | null,
): Promise<void> {
  if (gen === null) return;
  try {
    await redis.set(
      key(associationId),
      JSON.stringify({ dashboard, generation: gen }),
      'EX',
      MANAGER_DASHBOARD_TTL_SECONDS,
    );
  } catch {
    // Prochaine lecture recalculée.
  }
}

/** Invalidation (worker) : nouvelle génération, puis entrée retirée. */
export async function invalidateManagerDashboard(redis: Redis, associationId: string): Promise<void> {
  await redis.incr(generationKey(associationId));
  await redis.del(key(associationId));
}
