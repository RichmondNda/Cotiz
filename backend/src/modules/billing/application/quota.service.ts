import { Injectable } from '@nestjs/common';
import { memberships, plans, projects, subscriptions } from '@cotiz/db';
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { DomainProblem } from '../../../shared/http/domain-problem.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

/** Limites de l'abonnement en cours ; `null` : illimité. */
interface QuotaLimits {
  projects: number | null;
  subscribers: number | null;
  managers: number | null;
}
export type QuotaKind = keyof QuotaLimits;

/** Abonnement en cours : au plus un par association (index `subscriptions_one_active`). */
const CURRENT = ['trialing', 'active', 'past_due'] as const;
const MANAGER_ROLES = ['owner', 'manager', 'viewer'] as const;
/** Projets comptés par le quota : ni terminés ni archivés (lot 2.2, choix Q6). */
export const PROJECT_QUOTA_STATUSES = ['draft', 'enrolling', 'active'] as const;
/** Sans abonnement en cours (aucun, suspendu, résilié) : rien ne peut être ajouté (choix Q7). */
const NONE: QuotaLimits = { projects: 0, subscribers: 0, managers: 0 };

/**
 * Verrou de transaction d'un quota d'une association : pris par tout ajout (QuotaService.assert) et par un changement
 * de plan (pf.asso.plan) autour de leur comptage.
 */
export async function lockQuota(associationId: string, kind: QuotaKind): Promise<void> {
  await currentTx().execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`quota:${associationId}:${kind}`}, 0))`,
  );
}

/**
 * Quotas du plan (architecture/02, « Quotas de plan »), appelés par les cas d'usage qui créent projets, inscriptions et
 * gestionnaires, dans leur transaction. Limites de l'abonnement en cours et usage lus en base sous le verrou du quota :
 * un changement de plan concurrent (pf.asso.plan, même verrou) est vu dès son COMMIT, jamais une limite périmée.
 */
@Injectable()
export class QuotaService {
  /**
   * Permet `needed` ajouts de plus (un par défaut ; import en masse : toutes ses lignes), ou lève 409 `quota_exceeded`
   * (`limit`, `usage`). Verrou de transaction par association et
   * quota d'abord, puis limite et comptage : deux ajouts concurrents sont comptés l'un après l'autre (le cas d'usage
   * insère avant son COMMIT), et un changement de plan les ordonne de même.
   */
  async assert(associationId: string, kind: QuotaKind, needed = 1): Promise<void> {
    const context = currentContext();
    if (context?.space !== 'association' || context.associationId !== associationId) {
      throw new Error('QuotaService.assert : contexte de l’association attendu');
    }
    await lockQuota(associationId, kind);
    const limit = (await quotaLimitsOf(associationId))[kind];
    if (limit === null) return;
    const usage = await quotaUsageOf(associationId, kind);
    if (usage + needed > limit) throw new DomainProblem('quota_exceeded', { limit, usage });
  }
}

/**
 * Usage d'un quota, compté en base comme pour un ajout (QuotaService.assert) et pour l'affichage (bl.sub) :
 * gestionnaires = owner, manager, viewer invités ou actifs ; souscripteurs = non retirés (choix Q7) ; projets = ni
 * terminés ni archivés (Q6 du lot 2.2). Contexte de l'association seulement (jamais la connexion plateforme, qui
 * contourne la RLS).
 */
export async function quotaUsageOf(associationId: string, kind: QuotaKind): Promise<number> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error('quotaUsageOf : contexte de l’association attendu');
  }
  if (kind === 'projects') {
    const [row] = await currentTx()
      .select({ n: count() })
      .from(projects)
      .where(and(eq(projects.associationId, associationId), inArray(projects.status, PROJECT_QUOTA_STATUSES)));
    return row?.n ?? 0;
  }
  const roles = kind === 'managers' ? inArray(memberships.role, MANAGER_ROLES) : eq(memberships.role, 'subscriber');
  const [row] = await currentTx()
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.associationId, associationId), roles, ne(memberships.status, 'removed')));
  return row?.n ?? 0;
}

/** Limites de l'abonnement en cours de l'association (lues en base, jamais en cache). */
async function quotaLimitsOf(associationId: string): Promise<QuotaLimits> {
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
  return row
    ? { projects: row.projects, subscribers: row.subscribers, managers: row.managerSeatsOverride ?? row.managers }
    : NONE;
}

/**
 * Usage et limite d'un quota pour l'affichage (places de l'équipe, tm.team › list) ; `limit` `null` : illimité.
 * Contexte de l'association seulement.
 */
export async function quotaOf(associationId: string, kind: QuotaKind): Promise<{ used: number; limit: number | null }> {
  const used = await quotaUsageOf(associationId, kind);
  return { used, limit: (await quotaLimitsOf(associationId))[kind] };
}
