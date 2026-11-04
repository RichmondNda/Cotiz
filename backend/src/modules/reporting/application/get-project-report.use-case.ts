import { Injectable } from '@nestjs/common';
import type { PeriodQuery, ProjectReport } from '@cotiz/contracts';
import {
  type CollectionInstallment,
  collectionBySequence,
  collectionFigures,
  type Currency,
  inCollectionPeriod,
  Money,
  recoveryRateBySequence,
} from '@cotiz/domain';
import type { z } from 'zod';
import { lastValidatedPaymentDates } from '../../ledger/ledger.public.js';
import {
  associationToday,
  contextAssociationId,
  type EnrollmentEntry,
  installmentView,
  MemberDirectory,
  standingFacets,
} from '../../members/members.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { DomainProblem } from '../../../shared/http/index.js';

/** Échéances d'une inscription vues par la collecte : statut calculé au jour de l'association (installmentView). */
export function collectionLines(entry: EnrollmentEntry, today: string): CollectionInstallment[] {
  return entry.lines.map((line) => {
    const cell = installmentView(line, entry.project, today);
    return {
      kind: cell.kind,
      sequence: cell.sequence,
      dueDate: cell.dueDate,
      amountDue: cell.amountDue.amount,
      amountPaid: cell.amountPaid.amount,
      status: cell.status,
    };
  });
}

/**
 * rp.report : rapport d'un projet de l'association (mg-projet-rapports). Toutes les inscriptions du projet, retirées
 * comprises (la grille ne montre que les autres), statuts de la grille (installmentView au jour de l'association) ;
 * chiffres par collectionFigures() de @cotiz/domain : attendu = dû des échéances échues, encaissé = tout le versé
 * (Σ des allocations confirmées), reste et taux sur l'attendu. Période (inCollectionPeriod) : seules les échéances dont
 * la date tombe dans [from, to] comptent ; les situations (`standingCounts`) restent celles de toute l'inscription.
 */
@Injectable()
export class GetProjectReportUseCase {
  constructor(private readonly directory: MemberDirectory) {}

  async execute(aid: string, pid: string, query: z.infer<typeof PeriodQuery>): Promise<z.infer<typeof ProjectReport>> {
    const associationId = contextAssociationId(aid);
    const project = await projectOf(associationId, pid);
    if (!project) throw new DomainProblem('not_found');
    const currency = project.currency as Currency;
    const money = (amount: number) => Money.of(amount, currency);
    const today = await associationToday(associationId);
    // Inscriptions retirées comprises : le versé reçu et le dû échu avant le retrait restent (seules les échéances
    // futures sans versé sont annulées au retrait) ; encaissé = Σ des allocations confirmées du projet.
    const entries = await this.directory.entries(associationId, today, { projectId: pid });
    const lastPayments = await lastValidatedPaymentDates(associationId, pid);
    const byEntry = entries.map((entry) => ({
      entry,
      lines: collectionLines(entry, today).filter((l) => inCollectionPeriod(l.dueDate, query)),
    }));
    const all = byEntry.flatMap((e) => e.lines);
    const totals = collectionFigures(all, today);

    return {
      expected: money(totals.expectedToDate),
      received: money(totals.received),
      remaining: money(totals.remainingToDate),
      recoveryRate: totals.recoveryRate,
      collectionBySequence: collectionBySequence(all).map((c) => ({
        ...c,
        expected: money(c.expected),
        received: money(c.received),
      })),
      recoveryRateBySequence: recoveryRateBySequence(all, today),
      standingCounts: standingFacets(entries.map((e) => e.view.standing)),
      rows: byEntry.map(({ entry, lines }) => {
        const figures = collectionFigures(lines, today);
        return {
          member: { id: entry.member.id, firstName: entry.member.firstName, lastName: entry.member.lastName },
          expectedToDate: money(figures.expectedToDate),
          paid: money(figures.received),
          remaining: money(figures.remainingToDate),
          lateCount: figures.lateCount,
          lastPaymentOn: lastPayments.get(entry.row.id) ?? null,
        };
      }),
    };
  }
}
