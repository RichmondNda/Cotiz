import { Injectable } from '@nestjs/common';
import type { ListQuery, TimelineEvent } from '@cotiz/contracts';
import { enrollments } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { SubscriberActivationCodes } from '../../identity/identity.public.js';
import { projectsOf } from '../../projects/projects.public.js';
import { type AssociationAuditEntry, associationAuditTrailOf } from '../../../shared/audit/index.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { decodeSerialCursor, encodeSerialCursor } from '../../../shared/pagination/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { contextAssociationId } from './member-context.js';

type Event = z.infer<typeof TimelineEvent>;

/** Présentation de chaque action retenue (les recherches mb.lookup ne figurent pas dans la frise). */
const KINDS: Record<string, Pick<Event, 'type' | 'title' | 'tone'>> = {
  'enrollment.create': { type: 'enrolled', title: 'Inscription au projet', tone: 'brand' },
  'enrollment.withdraw': { type: 'withdrawn', title: 'Retrait du projet', tone: 'warning' },
  'member.update': { type: 'profile_updated', title: 'Fiche modifiée', tone: 'info' },
  'activation_code.issue': { type: 'activation_code_issued', title: 'Code d’activation généré', tone: 'neutral' },
  'activation_code.hand': { type: 'activation_code_handed', title: 'Code d’activation remis', tone: 'success' },
};

/**
 * mb.timeline : actions de l'association sur une personne inscrite chez elle (sinon 404), lues dans son journal
 * d'audit (choix de l'étape 6) : inscriptions et retraits, fiche modifiée, codes d'activation régénérés et remis. Les
 * plus récentes d'abord, pages par (date, id). Paiements, relances, signatures : lots suivants.
 */
@Injectable()
export class MemberTimelineUseCase {
  constructor(private readonly codes: SubscriberActivationCodes) {}

  async execute(aid: string, uid: string, query: z.infer<typeof ListQuery>) {
    if (query.sort !== undefined) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const after = query.cursor === undefined ? null : decodeSerialCursor(query.cursor);
    if (query.cursor !== undefined && !after) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }
    const associationId = contextAssociationId(aid);
    const own = await currentTx()
      .select({ id: enrollments.id, projectId: enrollments.projectId })
      .from(enrollments)
      .where(and(eq(enrollments.associationId, associationId), eq(enrollments.userId, uid)));
    if (own.length === 0) throw new DomainProblem('not_found');
    const codeIds = await this.codes.codeIdsOf(uid);
    const { entries, total } = await associationAuditTrailOf(
      [
        {
          entityType: 'enrollment',
          entityIds: own.map((e) => e.id),
          actions: ['enrollment.create', 'enrollment.withdraw'],
        },
        { entityType: 'user', entityIds: [uid], actions: ['member.update', 'activation_code.issue'] },
        { entityType: 'activation_code', entityIds: codeIds, actions: ['activation_code.hand'] },
      ],
      { after, limit: query.limit + 1 },
    );
    const page = entries.slice(0, query.limit);
    const projectOfEnrollment = new Map(own.map((e) => [e.id, e.projectId]));
    const projects = await projectsOf(associationId, [...new Set(own.map((e) => e.projectId))]);
    const last = page.at(-1);
    return {
      items: page.map((entry) => eventOf(entry, projects, projectOfEnrollment)),
      nextCursor: entries.length > query.limit && last ? encodeSerialCursor({ at: last.at, id: last.id }) : null,
      total,
    };
  }
}

function eventOf(
  entry: AssociationAuditEntry,
  projects: Map<string, { id: string; name: string }>,
  projectOfEnrollment: Map<string, string>,
): Event {
  const kind = KINDS[entry.action];
  if (!kind) throw new Error(`mb.timeline : action inattendue (${entry.action})`);
  const projectId =
    entry.entityType === 'enrollment' && entry.entityId ? projectOfEnrollment.get(entry.entityId) : null;
  const project = projectId ? projects.get(projectId) : undefined;
  const reason = entry.action === 'enrollment.withdraw' ? entry.after?.reason : null;
  return {
    id: entry.id,
    at: entry.occurredAt.toISOString(),
    ...kind,
    detail: typeof reason === 'string' ? reason : null,
    project: project ? { id: project.id, name: project.name } : null,
  };
}
