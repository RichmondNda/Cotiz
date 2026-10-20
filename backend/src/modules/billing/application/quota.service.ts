import { Injectable } from '@nestjs/common';
import { memberships, plans, subscriptions } from '@cotiz/db';
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { DomainProblem } from '../../../shared/http/domain-problem.js';
import { RedisClient } from '../../../shared/redis/redis.module.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { type QuotaLimits, readQuotaLimits, writeQuotaLimits } from '../infra/quota-limits-cache.js';

export type QuotaKind = keyof QuotaLimits;

/** Abonnement en cours : au plus un par association (index `subscriptions_one_active`). */
const CURRENT = ['trialing', 'active', 'past_due'] as const;
const MANAGER_ROLES = ['owner', 'manager', 'viewer'] as const;
/** Sans abonnement en cours (aucun, suspendu, résilié) : rien ne peut être ajouté (choix Q7). */
const NONE: QuotaLimits = { projects: 0, subscribers: 0, managers: 0 };

/**
 * Quotas du plan (architecture/02, « Quotas de plan »), appelés par les cas d'usage qui créent projets, inscriptions et
 * gestionnaires, dans leur transaction. Limites de l'abonnement en cours, en cache 5 min ; usage compté en direct.
 */
@Injectable()
export class QuotaService {
  constructor(private readonly redis: RedisClient) {}

  /**
   * Permet un ajout de plus, ou lève 409 `quota_exceeded` (`limit`, `usage`). Limites lues avant le verrou (Redis lent
   * ne le prolonge pas) ; verrou de transaction par association et quota autour du comptage : deux ajouts concurrents
   * sont comptés l'un après l'autre (le cas d'usage insère avant son COMMIT).
   */
  async assert(associationId: string, kind: QuotaKind): Promise<void> {
    const context = currentContext();
    if (context?.space !== 'association' || context.associationId !== associationId) {
      throw new Error('QuotaService.assert : contexte de l’association attendu');
    }
    if (kind === 'projects') throw new Error('QuotaService.assert : quota de projets branché au lot 2.1');
    const limit = (await this.limits(associationId))[kind];
    if (limit === null) return;
    await currentTx().execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`quota:${associationId}:${kind}`}, 0))`,
    );
    const usage = await this.usage(associationId, kind);
    if (usage >= limit) throw new DomainProblem('quota_exceeded', { limit, usage });
  }

  private async limits(associationId: string): Promise<QuotaLimits> {
    const cached = await readQuotaLimits(this.redis.redis, associationId);
    if (cached.limits) return cached.limits;
    const [row] = await currentTx()
      .select({
        projects: plans.maxProjects,
        subscribers: plans.maxSubscribers,
        managers: plans.maxManagers,
        managerSeatsOverride: subscriptions.managerSeatsOverride,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(and(eq(subscriptions.associationId, associationId), inArray(subscriptions.status, CURRENT)));
    const limits = row
      ? { projects: row.projects, subscribers: row.subscribers, managers: row.managerSeatsOverride ?? row.managers }
      : NONE;
    await writeQuotaLimits(this.redis.redis, associationId, limits, cached.generation);
    return limits;
  }

  /** Gestionnaires : owner, manager, viewer invités ou actifs ; souscripteurs : non retirés (choix Q7). */
  private async usage(associationId: string, kind: 'subscribers' | 'managers'): Promise<number> {
    const roles = kind === 'managers' ? inArray(memberships.role, MANAGER_ROLES) : eq(memberships.role, 'subscriber');
    const [row] = await currentTx()
      .select({ n: count() })
      .from(memberships)
      .where(and(eq(memberships.associationId, associationId), roles, ne(memberships.status, 'removed')));
    return row?.n ?? 0;
  }
}
