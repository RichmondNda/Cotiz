import { Injectable } from '@nestjs/common';
import type { ListQuery, PlatformAssociationProject } from '@cotiz/contracts';
import { enrollments, installments } from '@cotiz/db';
import { type Currency, Money } from '@cotiz/domain';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { platformProjectsOf } from '../../projects/projects.public.js';
import { platformAssociationOf } from '../../tenancy/tenancy.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { encodeCursor } from '../../../shared/pagination/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { listPosition, pageOf } from './member-directory.js';

/**
 * pf.asso.sub › projects : projets d'une association lus par la plateforme (connexion cotiz_platform), les plus
 * récents d'abord ; inscrits en cours (retraits exclus) et montant versé (échéances, retraits compris). Lecture
 * auditée (ADR 0017). Association inconnue : 404.
 */
@Injectable()
export class PlatformAssociationProjectsUseCase {
  @Audited('association.view_projects')
  async execute(id: string, query: z.infer<typeof ListQuery>) {
    const after = listPosition(query);
    const association = await platformAssociationOf(id);
    if (!association) throw new DomainProblem('not_found');
    recordAudit({ entityType: 'association', entityId: association.id, associationId: association.id });
    const rows = await platformProjectsOf(association.id);
    const ids = rows.map((r) => r.id);
    const tx = currentTx();
    const subscribers =
      ids.length === 0
        ? []
        : await tx
            .select({ projectId: enrollments.projectId, n: sql<number>`count(*)`.mapWith(Number) })
            .from(enrollments)
            .where(
              and(
                eq(enrollments.associationId, association.id),
                inArray(enrollments.projectId, ids),
                ne(enrollments.status, 'withdrawn'),
              ),
            )
            .groupBy(enrollments.projectId);
    const paid =
      ids.length === 0
        ? []
        : await tx
            .select({ projectId: installments.projectId, total: sql<string>`sum(${installments.amountPaid})::text` })
            .from(installments)
            .where(and(eq(installments.associationId, association.id), inArray(installments.projectId, ids)))
            .groupBy(installments.projectId);
    const subscribersOf = new Map(subscribers.map((s) => [s.projectId, s.n]));
    const paidOf = new Map(paid.map((p) => [p.projectId, p.total]));
    const items = rows.map((row) => {
      const currency = row.currency as Currency;
      const project: z.infer<typeof PlatformAssociationProject> = {
        id: row.id,
        name: row.name,
        status: row.status,
        subscribersCount: subscribersOf.get(row.id) ?? 0,
        collected: Money.fromDb(paidOf.get(row.id) ?? '0', currency),
        createdAt: row.createdAt.toISOString(),
      };
      // Clé de tri au format des curseurs (largeur fixe, à la milliseconde).
      return { at: row.createdAt.toISOString().replace('T', ' ').replace('Z', '+00'), project };
    });
    const page = pageOf(items, (i) => ({ at: i.at, id: i.project.id }), after, query.limit);
    return {
      items: page.items.map((i) => i.project),
      nextCursor: page.next ? encodeCursor(page.next) : null,
      total: items.length,
    };
  }
}
