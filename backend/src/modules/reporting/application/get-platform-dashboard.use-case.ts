import { Injectable } from '@nestjs/common';
import type { PlatformDashboard } from '@cotiz/contracts';
import type { z } from 'zod';
import {
  statsActiveAssociationsByMonth,
  statsAssociationsByPlan,
  statsPlatformKpi,
  statsRecurringRevenue,
} from '@cotiz/db';
import { type Currency, Money, monthlyRecurringRevenue } from '@cotiz/domain';
import { asc } from 'drizzle-orm';
import { platformSubscribersCount, platformTeamSizes } from '../../access/access.public.js';
import { planRefsOf, platformCurrentSubscriptions } from '../../billing/billing.public.js';
import { platformManagerActivityOf } from '../../identity/identity.public.js';
import { platformPendingRequestsOf } from '../../onboarding/onboarding.public.js';
import { platformAssociationsOverview } from '../../tenancy/tenancy.public.js';
import { platformRecentActivityOf } from '../../../shared/audit/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { watchlist } from '../domain/watchlist.js';

/** Devise de la plateforme : plans en XOF seulement (contrainte plans_currency_xof, PlanInput). */
const PLATFORM_CURRENCY: Currency = 'XOF';
const OLDEST_PENDING = 3;
const ACTIVITY_LIMIT = 10;
/** Actions du journal reprises dans l'activité récente (index `audit_platform_activity`), et le type affiché. */
const ACTIVITY: Readonly<Record<string, string>> = {
  'association.create': 'association.created',
  'association_request.approve': 'request.approved',
  'association.suspend': 'association.suspended',
  'association.reactivate': 'association.reactivated',
  'subscription.change_plan': 'plan.changed',
};

/**
 * pf.dashboard : tableau de bord plateforme (sa-dashboard). Compteurs, courbe sur 12 mois, répartition par plan et
 * revenu mensuel : vues matérialisées (au plus 15 min de retard, tâche stats.refresh). Demandes à traiter, souscripteurs,
 * associations à surveiller et activité : lus en direct. Connexion plateforme (cotiz_platform).
 */
@Injectable()
export class GetPlatformDashboardUseCase {
  async execute(now: Date = new Date()): Promise<z.infer<typeof PlatformDashboard>> {
    // L'une après l'autre : une transaction n'exécute qu'une requête à la fois.
    const tx = currentTx();
    const [kpi] = await tx.select().from(statsPlatformKpi);
    if (!kpi) throw new Error('stats_platform_kpi vide : migration 0009 non appliquée');
    const byMonth = await tx
      .select()
      .from(statsActiveAssociationsByMonth)
      .orderBy(asc(statsActiveAssociationsByMonth.month));
    const byPlan = await tx.select().from(statsAssociationsByPlan);
    const revenue = await tx.select().from(statsRecurringRevenue);
    const plans = await planRefsOf(byPlan.map((p) => p.planId));
    const pending = await platformPendingRequestsOf(OLDEST_PENDING);
    const subscribers = await platformSubscribersCount();

    const associations = await platformAssociationsOverview();
    const teams = await platformTeamSizes();
    const sessions = await platformManagerActivityOf([...teams.values()].flatMap((t) => t.activeManagerIds));
    const subscriptions = await platformCurrentSubscriptions();
    const recent = await platformRecentActivityOf(Object.keys(ACTIVITY), ACTIVITY_LIMIT);

    const names = new Map(associations.map((a) => [a.id, a.name]));
    const lastActivityOf = (associationId: string): Date | null => {
      let latest: Date | null = null;
      for (const userId of teams.get(associationId)?.activeManagerIds ?? []) {
        const at = sessions.get(userId);
        if (at && (!latest || at > latest)) latest = at;
      }
      return latest;
    };

    return {
      pendingRequests: pending.count,
      oldestPendingRequests: pending.oldest,
      kpi: {
        activeAssociations: kpi.activeAssociations,
        newAssociationsThisMonth: kpi.newAssociationsThisMonth,
        totalAssociations: kpi.totalAssociations,
        subscribers,
        monthlyRecurringRevenue: monthlyRecurringRevenue(
          revenue.map((r) => ({
            price: Money.fromDb(r.price, r.currency as Currency),
            billingPeriod: r.billingPeriod,
            count: r.count,
          })),
          PLATFORM_CURRENCY,
        ),
        subscriptionsUpToDate: kpi.subscriptionsUpToDate,
        subscriptionsUnpaid: kpi.subscriptionsUnpaid,
      },
      activeAssociationsByMonth: byMonth.map(({ month, count }) => ({ month, count })),
      associationsByPlan: byPlan
        .flatMap(({ planId, count }) => {
          const plan = plans.get(planId);
          return plan ? [{ plan, count }] : [];
        })
        .sort((a, b) => b.count - a.count || a.plan.name.localeCompare(b.plan.name, 'fr')),
      watchlist: watchlist(
        associations.map((a) => {
          const team = teams.get(a.id);
          const subscription = subscriptions.get(a.id);
          return {
            associationId: a.id,
            name: a.name,
            status: a.status,
            createdAt: a.createdAt,
            lastActivityAt: lastActivityOf(a.id),
            subscription: subscription
              ? { status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd }
              : null,
            usage: { subscribers: team?.subscribers ?? 0, managers: team?.managers ?? 0 },
            limits: subscription?.limits ?? null,
          };
        }),
        now,
      ),
      activity: recent.flatMap((e) => {
        const type = ACTIVITY[e.action];
        const associationName = names.get(e.associationId);
        return type && associationName
          ? [{ type, at: e.occurredAt.toISOString(), associationId: e.associationId, associationName }]
          : [];
      }),
    };
  }
}
