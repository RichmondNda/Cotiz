import { Injectable } from '@nestjs/common';
import type { ProjectOverview, ProjectSummary } from '@cotiz/contracts';
import {
  collectionBySequence,
  collectionFigures,
  collectionProgress,
  type CollectionInstallment,
  type Currency,
  Money,
  nextDue,
  nextDueDate,
} from '@cotiz/domain';
import type { z } from 'zod';
import { pendingPaymentsOverviewOf } from '../../ledger/ledger.public.js';
import {
  associationToday,
  type EnrollmentEntry,
  installmentView,
  MemberDirectory,
} from '../../members/members.public.js';
import { type ProjectRecord, projectScheduleLines } from '../../projects/projects.public.js';
import { currentContext } from '../../../shared/tenant-context/index.js';
import { collectionLines } from './get-project-report.use-case.js';

type Summary = z.infer<typeof ProjectSummary>;
type Overview = z.infer<typeof ProjectOverview>;

/** Une inscription et ses échéances vues par la collecte. */
export interface EntryLines {
  entry: EnrollmentEntry;
  lines: CollectionInstallment[];
}

/** Inscriptions qui engagent : ni retirées ni en attente de signature (mêmes souscripteurs que la grille). */
export const engaged = (e: EnrollmentEntry) => e.row.status === 'active' || e.row.status === 'completed';

/** Contexte de cette association seulement (RLS) : jamais les chiffres d'une autre. */
function assertAssociation(what: string, associationId: string): void {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error(`${what} : contexte de cette association seulement`);
  }
}

/** Collecte par échéance : une fois le projet en cours (comme l'écran mg-projet-overview). */
const WITH_COLLECTION = new Set(['active', 'completed', 'archived']);

/**
 * Indicateurs d'un projet sur ses inscriptions (as.dashboard, pr.list, pr.get) : argent sur toutes les inscriptions,
 * retirées comprises (comme rp.report) ; souscripteurs, retards et prochaine échéance sur celles qui engagent.
 */
export function summaryWithStats<S extends Summary>(
  summary: S,
  ofProject: readonly EntryLines[],
  pendingPaymentsCount: number,
  today: string,
): S {
  const currency = summary.installmentAmount.currency;
  const figures = collectionFigures(
    ofProject.flatMap((l) => l.lines),
    today,
  );
  const committed = ofProject.filter((l) => engaged(l.entry));
  const subscribersCount = committed.length;
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
      nextDueDate: nextDueDate(
        committed.flatMap((l) => l.lines),
        today,
      ),
    },
  };
}

/**
 * Chiffres des projets hors tableau de bord (pr.list, pr.get, pr.overview, réponses de pr.patch et pr.lifecycle) :
 * mêmes calculs que as.dashboard et rp.report (annuaire des inscriptions, statuts de la grille au jour de
 * l'association, @cotiz/domain), sans cache. Contexte de l'association (RLS).
 */
@Injectable()
export class ProjectFigures {
  constructor(private readonly directory: MemberDirectory) {}

  /** Résumés (ou projets complets) de l'association, indicateurs calculés. */
  async withStats<S extends Summary>(associationId: string, summaries: readonly S[]): Promise<S[]> {
    assertAssociation('ProjectFigures.withStats', associationId);
    if (summaries.length === 0) return [];
    const today = await associationToday(associationId);
    // Une transaction = une connexion : lectures l'une après l'autre.
    const entries = await this.directory.entries(associationId, today, { projectIds: summaries.map((s) => s.id) });
    const pending = await pendingPaymentsOverviewOf(associationId);
    const lines = entries.map((entry) => ({ entry, lines: collectionLines(entry) }));
    return summaries.map((summary) =>
      summaryWithStats(
        summary,
        lines.filter((l) => l.entry.row.projectId === summary.id),
        pending.byProject.get(summary.id) ?? 0,
        today,
      ),
    );
  }

  /**
   * pr.overview (mg-projet-overview) : encaissé, attendu et taux comme les indicateurs du projet ; retards et
   * prochaine échéance sur les inscriptions qui engagent ; collecte par échéance une fois le projet en cours (dates
   * fixes : une entrée par échéance du calendrier, même sans souscripteur) ; retardataires du plus gros reste dû au
   * plus petit.
   */
  async overview(associationId: string, project: ProjectRecord): Promise<Overview> {
    assertAssociation('ProjectFigures.overview', associationId);
    if (project.associationId !== associationId)
      throw new Error('ProjectFigures.overview : projet d’une autre association');
    const currency = project.currency as Currency;
    const money = (amount: number) => Money.of(amount, currency);
    const today = await associationToday(associationId);
    const entries = await this.directory.entries(associationId, today, { projectId: project.id });
    const pending = await pendingPaymentsOverviewOf(associationId);
    const byEntry = entries.map((entry) => ({ entry, lines: collectionLines(entry) }));
    const all = byEntry.flatMap((e) => e.lines);
    const committed = byEntry.filter((e) => engaged(e.entry));
    const totals = collectionFigures(all, today);

    const lateMembers = committed
      .filter((e) => e.entry.view.standing === 'late')
      .flatMap(({ entry, lines }) => {
        // Retard daté comme la grille (installmentView : date posée par la tâche des statuts, sinon fin de la grâce).
        const late = entry.lines
          .filter((_, index) => entry.states[index]?.status === 'late')
          .map((line) => installmentView(line, entry.project, today));
        const since = late
          .map((l) => l.lateSince)
          .filter((d): d is string => d !== null)
          .sort()[0];
        if (late.length === 0 || since === undefined) return [];
        return [
          {
            member: { id: entry.member.id, firstName: entry.member.firstName, lastName: entry.member.lastName },
            enrollmentId: entry.row.id,
            lateInstallments: late.length,
            amountDue: collectionFigures(lines, today).lateAmount,
            lateSince: since,
            lateDueDates: late.map((l) => l.dueDate).sort(),
          },
        ];
      })
      // À montant égal, l'ordre de l'annuaire.
      .sort((a, b) => b.amountDue - a.amountDue);

    // Dates fixes : tout le calendrier, sans perdre un rang d'échéance qui n'y serait plus (collectionBySequence).
    const collection = !WITH_COLLECTION.has(project.status)
      ? []
      : collectionBySequence(
          all,
          project.scheduleType === 'fixed' ? projectScheduleLines(project).filter((l) => l.kind === 'periodic') : [],
        );

    const next = nextDue(
      committed.flatMap((e) => e.lines),
      today,
    );
    // Montant = Σ des retardataires listés : nombre et montant toujours d'accord.
    const lateAmount = lateMembers.reduce((total, l) => total + l.amountDue, 0);
    return {
      collected: money(totals.received),
      expectedToDate: money(totals.expectedToDate),
      recoveryRate: totals.recoveryRate,
      late: { count: lateMembers.length, amount: money(lateAmount) },
      nextDue: next ? { dueDate: next.dueDate, expectedTotal: money(next.expectedTotal) } : null,
      enrollment: { count: committed.length, required: project.requiredSubscribers },
      paymentsToReview: {
        count: pending.byProject.get(project.id) ?? 0,
        oldestDeclaredAt: pending.oldestByProject.get(project.id) ?? null,
      },
      // Signature des contrats : lot 4.1 (aucune inscription en attente de signature avant).
      unsignedContracts: byEntry
        .filter((e) => e.entry.row.status === 'pending_signature')
        .map(({ entry }) => ({
          enrollmentId: entry.row.id,
          member: { id: entry.member.id, firstName: entry.member.firstName, lastName: entry.member.lastName },
          enrolledAt: entry.row.joinedAt.toISOString(),
        })),
      collectionBySequence: collection.map((c) => ({
        sequence: c.sequence,
        dueDate: c.dueDate,
        expected: money(c.expected),
        received: money(c.received),
      })),
      lateMembers: lateMembers.map((l) => ({ ...l, amountDue: money(l.amountDue) })),
    };
  }
}
