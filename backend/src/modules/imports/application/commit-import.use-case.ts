import { Injectable } from '@nestjs/common';
import type { ImportJob } from '@cotiz/contracts';
import { importJobs, importRows } from '@cotiz/db';
import { and, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { quotaCountedSubscribersOf } from '../../access/access.public.js';
import { assertPlanFeature, QuotaService } from '../../billing/billing.public.js';
import { contextAssociationId } from '../../members/members.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { countsOf, importOf, type StoredCounts, toImportJob } from './import-records.js';

/** Projet ouvert aux inscriptions (en.create). */
const OPEN = new Set(['enrolling', 'active']);

/**
 * im.commit : envoi d'un import classé (`validated`, sinon 409 `invalid_state`), exécuté par le worker
 * (`import.commit_requested`) qui inscrit les lignes prêtes et les comptes existants une à une par le cas d'usage
 * d'inscription (en.create) ; lignes en erreur, doublons et lignes ignorées sont laissés de côté. Projet fermé aux
 * inscriptions ou aucune ligne à inscrire : 409 `invalid_state`. Places du plan contrôlées pour toutes les lignes qui
 * ajoutent un souscripteur à l'association (409 `quota_exceeded`, `limit`, `usage`) ; en.create recontrôle chaque ligne.
 * Réponse 202 : l'écran suit la progression par im.read. Audité.
 */
@Injectable()
export class CommitImportUseCase {
  constructor(
    private readonly quotas: QuotaService,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('import.commit')
  async execute(aid: string, id: string): Promise<z.infer<typeof ImportJob>> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    const job = await importOf(associationId, id, { lock: true });
    if (!job) throw new DomainProblem('not_found');
    if (job.status !== 'validated') throw new DomainProblem('invalid_state');
    await assertPlanFeature(associationId, 'imports');
    const project = await projectOf(associationId, job.projectId);
    if (!project) throw new DomainProblem('not_found');
    if (!OPEN.has(project.status)) throw new DomainProblem('invalid_state');

    const rows = await currentTx()
      .select({ category: importRows.category, userId: importRows.resolvedUserId })
      .from(importRows)
      .where(and(eq(importRows.importJobId, job.id), inArray(importRows.category, ['ready', 'existing'])));
    if (rows.length === 0) throw new DomainProblem('invalid_state');
    const existing = rows.flatMap((r) => (r.category === 'existing' && r.userId ? [r.userId] : []));
    const counted = await quotaCountedSubscribersOf(associationId, existing);
    const needed = rows.length - counted.size;
    if (needed > 0) await this.quotas.assert(associationId, 'subscribers', needed);

    const counts: StoredCounts = {
      ...countsOf(job),
      progress: { total: rows.length, processed: 0, enrolled: 0, attached: 0, failed: 0 },
    };
    const [updated] = await currentTx()
      .update(importJobs)
      .set({ status: 'importing', counts })
      .where(eq(importJobs.id, job.id))
      .returning();
    if (!updated) throw new DomainProblem('not_found');
    await this.outbox.publish(currentTx(), {
      type: 'import.commit_requested',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'import', id: job.id },
      payload: { importId: job.id, requestedBy: actor.userId },
    });
    recordAudit({
      entityType: 'import',
      entityId: job.id,
      before: { status: job.status },
      after: { status: 'importing', projectId: job.projectId, rows: rows.length },
    });
    return toImportJob(updated);
  }
}
