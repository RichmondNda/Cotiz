import { Injectable } from '@nestjs/common';
import type { ContractSummary, ListQuery } from '@cotiz/contracts';
import { contracts, projects } from '@cotiz/db';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { DomainProblem } from '../../../shared/http/index.js';
import { decodeCursor, encodeCursor } from '../../../shared/pagination/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { assertContractsFeature, contextAssociationId } from './contract-records.js';

/** Au-delà, une inscription en attente de signature est signalée (mg-contrats, comme les mocks). */
const UNSIGNED_DAYS = 7;

export interface ContractPage {
  items: z.infer<typeof ContractSummary>[];
  nextCursor: string | null;
  total: number;
}

/**
 * ct.list : contrats de l'association, le plus récent d'abord, pages par curseur (date de création, id), avec l'état
 * des signatures (comptées comme ct.get) et les inscriptions en attente depuis plus de 7 jours. Fonctionnalité
 * `contracts` du plan.
 */
@Injectable()
export class ListContractsUseCase {
  async execute(aid: string, query: ListQuery): Promise<ContractPage> {
    const associationId = contextAssociationId(aid);
    await assertContractsFeature(associationId);
    if (query.sort !== undefined) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && !cursor) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }

    const pending = sql`e.association_id = ${contracts.associationId} AND e.project_id = ${contracts.projectId}
                        AND e.status = 'pending_signature'`;
    const ofAssociation = eq(contracts.associationId, associationId);
    const after = cursor
      ? sql`(${contracts.createdAt}, ${contracts.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
      : undefined;
    const tx = currentTx();
    const rows = await tx
      .select({
        id: contracts.id,
        projectId: contracts.projectId,
        projectName: projects.name,
        createdAt: contracts.createdAt,
        at: sql<string>`${contracts.createdAt}::text`,
        lockedAt: contracts.lockedAt,
        signed: sql<number>`(SELECT count(*)::int FROM contract_signatures s WHERE s.contract_id = ${contracts.id})`,
        pending: sql<number>`(SELECT count(*)::int FROM enrollments e WHERE ${pending})`,
        pendingOver: sql<number>`(SELECT count(*)::int FROM enrollments e WHERE ${pending}
                                    AND e.joined_at < now() - make_interval(days => ${UNSIGNED_DAYS}))`,
      })
      .from(contracts)
      .innerJoin(
        projects,
        and(eq(projects.id, contracts.projectId), eq(projects.associationId, contracts.associationId)),
      )
      .where(and(ofAssociation, after))
      .orderBy(desc(contracts.createdAt), desc(contracts.id))
      .limit(query.limit + 1);
    const [totals] = await tx.select({ n: count() }).from(contracts).where(ofAssociation);

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => ({
        project: { id: r.projectId, name: r.projectName },
        createdAt: r.createdAt.toISOString(),
        lockedAt: r.lockedAt?.toISOString() ?? null,
        signed: r.signed,
        total: r.signed + r.pending,
        unsignedOver7Days: r.pendingOver,
      })),
      nextCursor: rows.length > query.limit && last ? encodeCursor({ at: last.at, id: last.id }) : null,
      total: totals?.n ?? 0,
    };
  }
}
