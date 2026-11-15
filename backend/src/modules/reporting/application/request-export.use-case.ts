import { Injectable } from '@nestjs/common';
import type { CreateExportInput, ExportJob } from '@cotiz/contracts';
import { exportJobs } from '@cotiz/db';
import { exportQuotaIssue, todayIn } from '@cotiz/domain';
import { eq, gte, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { assertPlanFeature } from '../../billing/billing.public.js';
import { contextAssociationId } from '../../members/members.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { type ExportParams, toExportJob } from './export-records.js';

/** Types qui portent sur un projet (rapport) ; `members_csv` porte sur toute l'association. */
const PROJECT_KINDS = new Set(['project_report_csv', 'project_report_pdf']);

/**
 * rp.export › create : export demandé, produit ensuite par le worker (`export.requested` → file `exports`).
 * Fonctionnalité `exports` du plan (403 `feature_disabled`) ; rapport de projet : projet de l'association exigé
 * (absent : 422, inconnu : 404) ; période `from` ≤ `to`. Quota (`exportQuotaIssue`, 409 `quota_exceeded`) : un seul
 * export en attente ou en cours, 20 par jour local ; compté sous verrou consultatif de l'association (deux demandes
 * simultanées ne passent pas toutes deux). Audité ; 202 et l'export `queued`.
 */
@Injectable()
export class RequestExportUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('export.request')
  async execute(aid: string, input: z.infer<typeof CreateExportInput>): Promise<z.infer<typeof ExportJob>> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    await assertPlanFeature(associationId, 'exports');
    const forProject = PROJECT_KINDS.has(input.kind);
    if (forProject && !input.projectId) {
      throw new DomainProblem('validation_failed', { fields: { projectId: 'required' } });
    }
    if (input.from && input.to && input.from > input.to) {
      throw new DomainProblem('validation_failed', { fields: { to: 'before_from' } });
    }
    if (input.projectId && !(await projectOf(associationId, input.projectId))) throw new DomainProblem('not_found');
    const association = await ownAssociationOf(associationId);
    if (!association) throw new DomainProblem('not_found');

    const tx = currentTx();
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`exports:${associationId}`}, 0))`);
    // Début du jour local de l'association (quota quotidien) ; les exports en cours comptent quel que soit leur jour.
    const today = todayIn(association.timezone);
    const dayStart = sql`(${today}::date::timestamp AT TIME ZONE ${association.timezone})`;
    const [usage] = await tx
      .select({
        inProgress: sql<number>`count(*) FILTER (WHERE ${inArray(exportJobs.status, ['queued', 'running'])})`.mapWith(
          Number,
        ),
        requestedToday: sql<number>`count(*) FILTER (WHERE ${gte(exportJobs.createdAt, dayStart)})`.mapWith(Number),
      })
      .from(exportJobs)
      .where(eq(exportJobs.associationId, associationId));
    const issue = exportQuotaIssue({ inProgress: usage?.inProgress ?? 0, requestedToday: usage?.requestedToday ?? 0 });
    if (issue) throw new DomainProblem('quota_exceeded', issue);

    const params: ExportParams = {
      ...(input.projectId && { projectId: input.projectId }),
      ...(forProject && input.from && { from: input.from }),
      ...(forProject && input.to && { to: input.to }),
    };
    const [job] = await tx
      .insert(exportJobs)
      .values({ associationId, requestedBy: actor.userId, kind: input.kind, params })
      .returning();
    if (!job) throw new Error('export non créé');
    await this.outbox.publish(tx, {
      type: 'export.requested',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'export', id: job.id },
      payload: { exportId: job.id },
    });
    recordAudit({ entityType: 'export', entityId: job.id, after: { kind: job.kind, params } });
    return toExportJob(job);
  }
}
