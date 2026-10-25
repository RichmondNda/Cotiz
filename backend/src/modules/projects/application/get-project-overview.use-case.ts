import { Injectable } from '@nestjs/common';
import type { ProjectOverview } from '@cotiz/contracts';
import { type Currency, Money } from '@cotiz/domain';
import type { z } from 'zod';
import { DomainProblem } from '../../../shared/http/index.js';
import { contextAssociationId, projectOf, projectScheduleLines } from './project-records.js';

/** Collecte par échéance : dates fixes, une fois le projet en cours (comme l'écran mg-projet-overview). */
const WITH_COLLECTION = new Set(['active', 'completed', 'archived']);

/**
 * pr.overview : synthèse d'un projet (mg-projet-overview). Avant les inscriptions (lot 2.3) et les paiements (lot 2.4) :
 * aucun souscripteur, rien d'attendu, d'encaissé ni en retard, aucune prochaine échéance due ; dates fixes en cours ou
 * terminées : une entrée par échéance du calendrier (generateSchedule(), hors fonds d'entrée), à 0 dans la devise du
 * projet. Les lots 2.3 et 2.4 y lisent les échéances et les paiements.
 */
@Injectable()
export class GetProjectOverviewUseCase {
  async execute(aid: string, pid: string): Promise<z.infer<typeof ProjectOverview>> {
    const row = await projectOf(contextAssociationId(aid), pid);
    if (!row) throw new DomainProblem('not_found');
    const zero = Money.zero(row.currency as Currency);
    const collection =
      row.scheduleType === 'fixed' && WITH_COLLECTION.has(row.status)
        ? projectScheduleLines(row)
            .filter((l) => l.kind === 'periodic')
            .map((l) => ({ sequence: l.sequence, dueDate: l.dueDate, expected: zero, received: zero }))
        : [];
    return {
      collected: zero,
      expectedToDate: zero,
      recoveryRate: null,
      late: { count: 0, amount: zero },
      nextDue: null,
      enrollment: { count: 0, required: row.requiredSubscribers },
      paymentsToReview: { count: 0, oldestDeclaredAt: null },
      unsignedContracts: [],
      collectionBySequence: collection,
      lateMembers: [],
    };
  }
}
