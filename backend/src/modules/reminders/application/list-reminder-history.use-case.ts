import { Injectable } from '@nestjs/common';
import type { ListQuery, ReminderHistoryEntry } from '@cotiz/contracts';
import { installments, projects, reminderRuns, users } from '@cotiz/db';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import { contextAssociationId } from '../../members/members.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { decodeCursor, encodeCursor } from '../../../shared/pagination/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

type Entry = z.infer<typeof ReminderHistoryEntry>;

/**
 * rm.hist : historique des relances de l'association (lot 4.3), la plus récente d'abord, pages par curseur (date, id) :
 * automatiques et manuelles, statut (rappel envoyé, à relancer, relancé, ignoré), destinataire, projet, canaux, message,
 * auteur d'une relance manuelle. Filtre de projet. Lecture (`association.read`), sans fonctionnalité exigée.
 */
@Injectable()
export class ListReminderHistoryUseCase {
  async execute(
    aid: string,
    query: ListQuery & { projectId?: string },
  ): Promise<{ items: Entry[]; nextCursor: string | null; total: number }> {
    const associationId = contextAssociationId(aid);
    if (query.sort !== undefined) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && !cursor) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }
    const member = alias(users, 'member');
    const author = alias(users, 'author');
    const scope = and(
      eq(reminderRuns.associationId, associationId),
      query.projectId ? eq(installments.projectId, query.projectId) : undefined,
    );
    const after = cursor
      ? sql`(${reminderRuns.createdAt}, ${reminderRuns.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
      : undefined;
    const tx = currentTx();
    const rows = await tx
      .select({
        id: reminderRuns.id,
        at: sql<string>`${reminderRuns.createdAt}::text`,
        createdAt: reminderRuns.createdAt,
        kind: reminderRuns.kind,
        status: reminderRuns.status,
        channels: reminderRuns.channels,
        message: reminderRuns.message,
        ruleId: reminderRuns.ruleId,
        member: { id: member.id, firstName: member.firstName, lastName: member.lastName },
        project: { id: projects.id, name: projects.name },
        author: { id: author.id, firstName: author.firstName, lastName: author.lastName },
      })
      .from(reminderRuns)
      .innerJoin(
        installments,
        and(
          eq(installments.id, reminderRuns.installmentId),
          eq(installments.associationId, reminderRuns.associationId),
        ),
      )
      .innerJoin(
        projects,
        and(eq(projects.id, installments.projectId), eq(projects.associationId, reminderRuns.associationId)),
      )
      .innerJoin(member, eq(member.id, reminderRuns.userId))
      .leftJoin(author, eq(author.id, reminderRuns.triggeredBy))
      .where(and(scope, after))
      .orderBy(desc(reminderRuns.createdAt), desc(reminderRuns.id))
      .limit(query.limit + 1);
    const [totals] = await tx
      .select({ n: count() })
      .from(reminderRuns)
      .innerJoin(
        installments,
        and(
          eq(installments.id, reminderRuns.installmentId),
          eq(installments.associationId, reminderRuns.associationId),
        ),
      )
      .where(scope);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        kind: r.kind,
        status: r.status,
        member: r.member,
        project: r.project,
        channels: r.channels,
        message: r.message,
        triggeredBy: r.author?.id
          ? { id: r.author.id, firstName: r.author.firstName, lastName: r.author.lastName }
          : null,
        ruleId: r.ruleId,
      })),
      nextCursor: rows.length > query.limit && last ? encodeCursor({ at: last.at, id: last.id }) : null,
      total: totals?.n ?? 0,
    };
  }
}
