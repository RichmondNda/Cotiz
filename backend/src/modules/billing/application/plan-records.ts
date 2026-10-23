import type { Plan, PlanRef, PublicPlan } from '@cotiz/contracts';
import { plans, subscriptions } from '@cotiz/db';
import { type Currency, Money } from '@cotiz/domain';
import { and, asc, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { isPlanGated } from '../domain/plan-rules.js';

export type PlanRow = typeof plans.$inferSelect;

/** Ordre d'affichage : prix mensuel croissant (landing, grille du super-admin), puis ancienneté. */
const ORDER = [asc(plans.priceMonthly), asc(plans.createdAt), asc(plans.code)] as const;

/** Plan tel qu'affiché publiquement. Montants lus par `Money.fromDb` ; fonctionnalités `planGated` seulement. */
export function toPublicPlan(row: PlanRow): PublicPlan {
  const currency = row.currency as Currency;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    priceMonthly: Money.fromDb(row.priceMonthly, currency),
    priceYearly: Money.fromDb(row.priceYearly, currency),
    limits: { projects: row.maxProjects, subscribers: row.maxSubscribers, managers: row.maxManagers },
    features: row.features.filter(isPlanGated),
    isFeatured: row.isFeatured,
  };
}

export function toPlan(row: PlanRow, subscribersCount: number): Plan {
  return {
    ...toPublicPlan(row),
    isActive: row.isActive,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    subscribersCount,
    version: row.version,
  };
}

/** Références des plans donnés (plan souhaité d'une demande), par identifiant. */
export async function planRefsOf(ids: readonly string[]): Promise<Map<string, PlanRef>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await currentTx()
    .select({ id: plans.id, code: plans.code, name: plans.name })
    .from(plans)
    .where(inArray(plans.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Le plan existe et est proposé (actif) : plan souhaité du formulaire de demande (pub.request). */
export async function isActivePlan(planId: string): Promise<boolean> {
  const [row] = await currentTx()
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.isActive, true)));
  return row !== undefined;
}

/** Plans actifs (pub.plans). */
export async function activePlans(): Promise<PlanRow[]> {
  return currentTx()
    .select()
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(...ORDER);
}

/**
 * Associations abonnées à chaque plan : abonnements non résiliés (un plan archivé reste appliqué à ses abonnés).
 * Lecture de toutes les associations : connexion plateforme (BYPASSRLS) des routes /platform seulement.
 */
const subscribed = () =>
  currentTx()
    .select({ planId: subscriptions.planId, n: count().as('n') })
    .from(subscriptions)
    .where(ne(subscriptions.status, 'canceled'))
    .groupBy(subscriptions.planId)
    .as('subscribed');

/** Tous les plans, archivés compris, avec leurs abonnés (pf.plans). */
export async function allPlans(): Promise<Plan[]> {
  const counts = subscribed();
  const rows = await currentTx()
    .select({ plan: plans, n: sql<number>`coalesce(${counts.n}, 0)::int` })
    .from(plans)
    .leftJoin(counts, eq(counts.planId, plans.id))
    .orderBy(...ORDER);
  return rows.map(({ plan, n }) => toPlan(plan, n));
}

/** Un plan, verrouillé pour une modification si demandé ; `null` s'il n'existe pas. */
export async function findPlan(id: string, options: { lock?: boolean } = {}): Promise<PlanRow | null> {
  const query = currentTx().select().from(plans).where(eq(plans.id, id)).limit(1);
  const [row] = options.lock ? await query.for('update') : await query;
  return row ?? null;
}

export async function subscribersOf(planId: string): Promise<number> {
  const [row] = await currentTx()
    .select({ n: count() })
    .from(subscriptions)
    .where(and(eq(subscriptions.planId, planId), ne(subscriptions.status, 'canceled')));
  return row?.n ?? 0;
}

export async function codeTaken(code: string, exceptId?: string): Promise<boolean> {
  const [row] = await currentTx()
    .select({ id: plans.id })
    .from(plans)
    .where(exceptId === undefined ? eq(plans.code, code) : and(eq(plans.code, code), ne(plans.id, exceptId)))
    .limit(1);
  return row !== undefined;
}

/** Codes déjà pris qui commencent par `prefix` (copies d'un plan). */
export async function codesStartingWith(prefix: string): Promise<Set<string>> {
  const rows = await currentTx()
    .select({ code: plans.code })
    .from(plans)
    .where(sql`starts_with(${plans.code}, ${prefix})`);
  return new Set(rows.map((r) => r.code));
}

/** Plan tel qu'inscrit au journal d'audit (avant/après). */
export function auditView(row: PlanRow): Record<string, unknown> {
  const { subscribersCount: _count, ...view } = toPlan(row, 0);
  return view;
}
