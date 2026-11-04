import { Injectable } from '@nestjs/common';
import type { ManagerDashboard, ProjectSummary } from '@cotiz/contracts';
import {
  collectionFigures,
  collectionProgress,
  type Currency,
  Money,
  monthlyCollection,
  nextDueDate as nextDueOf,
  recentMonths,
} from '@cotiz/domain';
import type { z } from 'zod';
import { SubscriberAccounts, SubscriberActivationCodes } from '../../identity/identity.public.js';
import { latestPaymentsOf, monthlyReceiptsOf, pendingPaymentsOverviewOf } from '../../ledger/ledger.public.js';
import {
  associationToday,
  contextAssociationId,
  type EnrollmentEntry,
  MemberDirectory,
} from '../../members/members.public.js';
import { associationProjectsOf, toSummaries } from '../../projects/projects.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { RedisClient } from '../../../shared/redis/redis.module.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { readManagerDashboard, writeManagerDashboard } from '../infra/manager-dashboard-cache.js';
import { collectionLines } from './get-project-report.use-case.js';

type Dashboard = z.infer<typeof ManagerDashboard>;
type Summary = z.infer<typeof ProjectSummary>;

/** 6 derniers mois, le dernier est le mois en cours (contrat). */
const MONTHS = 6;
const LATEST_PAYMENTS = 5;
/** Un contrat est « en souffrance » au-delà de 7 jours sans signature (contrat ManagerDashboard). */
const UNSIGNED_DAYS = 7;
const DAY_MS = 86_400_000;

/** Inscriptions qui engagent : ni retirées ni en attente de signature (mêmes souscripteurs que la grille). */
const engaged = (e: EnrollmentEntry) => e.row.status === 'active' || e.row.status === 'completed';

/**
 * as.dashboard : tableau de bord gestionnaire (mg-dashboard), en cache 60 s par association (architecture/09),
 * invalidé par les événements de l'association (ManagerDashboardCacheConsumer, worker).
 *
 * Chiffres par @cotiz/domain, sur les mêmes échéances que rp.report (statuts de la grille au jour de l'association) :
 * - collecté du mois = Σ des allocations confirmées des paiements validés dans le mois (fuseau de l'association) ;
 *   attendu du mois = dû des échéances qui comptent datées du mois (monthlyCollection) ;
 * - recouvrement = recouvré / attendu à date, toutes inscriptions (collectionFigures) ;
 * - souscripteurs = personnes ayant une inscription qui engage ; en retard = celles dont une telle inscription est en
 *   retard (situation de la grille) ;
 * - projets triés par nombre de souscripteurs en retard, avec leurs indicateurs calculés ici (pr.list les laisse à 0).
 */
@Injectable()
export class GetManagerDashboardUseCase {
  constructor(
    private readonly directory: MemberDirectory,
    private readonly accounts: SubscriberAccounts,
    private readonly codes: SubscriberActivationCodes,
    private readonly redis: RedisClient,
  ) {}

  async execute(aid: string): Promise<Dashboard> {
    const associationId = contextAssociationId(aid);
    const cached = await readManagerDashboard(this.redis.redis, associationId);
    if (cached.dashboard) return cached.dashboard;
    const dashboard = await this.compute(associationId);
    await writeManagerDashboard(this.redis.redis, associationId, dashboard, cached.generation);
    return dashboard;
  }

  private async compute(associationId: string): Promise<Dashboard> {
    const association = await ownAssociationOf(associationId);
    if (!association) throw new DomainProblem('not_found');
    const currency = association.currency as Currency;
    const money = (amount: number) => Money.of(amount, currency);
    const today = await associationToday(associationId);
    const months = recentMonths(today, MONTHS);
    const firstMonth = months[0] ?? today;

    // Une transaction = une connexion : lectures l'une après l'autre.
    const entries = await this.directory.entries(associationId, today, {});
    const projects = await associationProjectsOf(associationId);
    const pending = await pendingPaymentsOverviewOf(associationId);
    const receipts = await monthlyReceiptsOf(associationId, association.timezone, firstMonth);
    // Une seule devise par association (ses projets prennent la sienne) : jamais d'addition de devises différentes.
    if (receipts.some((r) => r.currency !== currency)) {
      throw new Error('as.dashboard : paiement dans une autre devise que celle de l’association');
    }
    const latestPayments = await latestPaymentsOf(associationId, this.accounts, LATEST_PAYMENTS);
    const activationCodesToHand = await this.codes.count({ handed: false });

    const lines = entries.map((entry) => ({ entry, lines: collectionLines(entry, today) }));
    const all = lines.flatMap((l) => l.lines);
    const totals = collectionFigures(all, today);
    const monthly = monthlyCollection(all, receipts, months);
    const current = monthly.at(-1) ?? { expected: 0, received: 0 };

    const subscribers = new Set(entries.filter(engaged).map((e) => e.row.userId));
    const late = new Set(entries.filter((e) => engaged(e) && e.view.standing === 'late').map((e) => e.row.userId));

    const summaries = (await toSummaries(projects)).map((summary) =>
      withStats(
        summary,
        lines.filter((l) => l.entry.row.projectId === summary.id),
        pending.byProject.get(summary.id) ?? 0,
        today,
      ),
    );

    const now = Date.now();
    return {
      collectedThisMonth: money(current.received),
      expectedThisMonth: money(current.expected),
      paymentsToReview: { count: pending.count, oldestDeclaredAt: pending.oldestDeclaredAt },
      lateSubscribers: { count: late.size, activeCount: subscribers.size },
      recoveryRate: totals.recoveryRate,
      subscribersCount: subscribers.size,
      projectsCount: projects.length,
      activationCodesToHand,
      unsignedContracts: entries
        .filter((e) => e.row.status === 'pending_signature' && now - e.row.joinedAt.getTime() > UNSIGNED_DAYS * DAY_MS)
        .map((e) => ({
          enrollmentId: e.row.id,
          member: { id: e.member.id, firstName: e.member.firstName, lastName: e.member.lastName },
          project: { id: e.project.id, name: e.project.name },
          since: e.row.joinedAt.toISOString(),
        })),
      monthlyCollection: monthly.map((m) => ({
        month: m.month,
        expected: money(m.expected),
        received: money(m.received),
      })),
      projects: summaries
        .map((summary, index) => ({ summary, index }))
        // À retards égaux, l'ordre de création.
        .sort(
          (a, b) => b.summary.stats.lateSubscribersCount - a.summary.stats.lateSubscribersCount || a.index - b.index,
        )
        .map(({ summary }) => summary),
      latestPayments,
    };
  }
}

/** Indicateurs d'un projet sur ses inscriptions (retirées comprises pour l'argent, comme rp.report). */
function withStats(
  summary: Summary,
  ofProject: { entry: EnrollmentEntry; lines: ReturnType<typeof collectionLines> }[],
  pendingPaymentsCount: number,
  today: string,
): Summary {
  const currency = summary.installmentAmount.currency;
  const figures = collectionFigures(
    ofProject.flatMap((l) => l.lines),
    today,
  );
  const committed = ofProject.filter((l) => engaged(l.entry));
  const subscribersCount = committed.length;
  const nextDueDate = nextDueOf(
    committed.flatMap((l) => l.lines),
    today,
  );
  return {
    ...summary,
    stats: {
      ...summary.stats,
      subscribersCount,
      collected: Money.of(figures.received, currency),
      expectedToDate: Money.of(figures.expectedToDate, currency),
      recoveryRate: figures.recoveryRate,
      progress: collectionProgress({
        status: summary.status,
        subscribersCount,
        requiredSubscribers: summary.requiredSubscribers,
        received: figures.received,
        totalPerSubscriber: summary.stats.totalPerSubscriber?.amount ?? null,
      }),
      lateSubscribersCount: committed.filter((l) => l.entry.view.standing === 'late').length,
      pendingPaymentsCount,
      pendingSignaturesCount: ofProject.filter((l) => l.entry.row.status === 'pending_signature').length,
      nextDueDate,
    },
  };
}
