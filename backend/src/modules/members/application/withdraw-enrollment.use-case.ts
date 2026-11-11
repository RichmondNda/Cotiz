import { Injectable } from '@nestjs/common';
import type { Enrollment, WithdrawInput } from '@cotiz/contracts';
import { enrollments, installments } from '@cotiz/db';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { SubscriberAccounts } from '../../identity/identity.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { toEnrollment } from './enrollment-views.js';
import { associationToday, contextAssociationId } from './member-context.js';

/**
 * en.withdraw (domain-rules § 8 : `active → withdrawn` ou `pending_signature → withdrawn`, sinon `invalid_state` ;
 * en attente de signature : aucune échéance, la signature n'est plus possible) : échéances futures (après aujourd'hui
 * dans le fuseau de l'association) sans aucun montant versé ni déclaré annulées (`canceled`) ; échues toujours dues ;
 * appartenance conservée (défaut du lot). Verrous dans l'ordre de la clôture (Q2) : projet, inscription, échéances par
 * identifiant. member.withdrawn, audit.
 */
@Injectable()
export class WithdrawEnrollmentUseCase {
  constructor(
    private readonly accounts: SubscriberAccounts,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('enrollment.withdraw')
  async execute(aid: string, eid: string, input: z.infer<typeof WithdrawInput>): Promise<Enrollment> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    const tx = currentTx();
    const [found] = await tx
      .select({ projectId: enrollments.projectId })
      .from(enrollments)
      .where(and(eq(enrollments.associationId, associationId), eq(enrollments.id, eid)));
    if (!found) throw new DomainProblem('not_found');
    const project = await projectOf(associationId, found.projectId, { lock: 'share' });
    const [current] = await tx.select().from(enrollments).where(eq(enrollments.id, eid)).for('update');
    if (!project || !current) throw new DomainProblem('not_found');
    if (current.status !== 'active' && current.status !== 'pending_signature') throw new DomainProblem('invalid_state');

    const today = await associationToday(aid);
    const future = await tx
      .select({ id: installments.id })
      .from(installments)
      .where(
        and(
          eq(installments.enrollmentId, eid),
          gt(installments.dueDate, today),
          eq(installments.amountPaid, 0n),
          eq(installments.amountPending, 0n),
          inArray(installments.status, ['upcoming', 'due', 'late']),
        ),
      )
      .orderBy(asc(installments.id))
      .for('update');
    if (future.length > 0) {
      await tx
        .update(installments)
        .set({ status: 'canceled', lateSince: null })
        .where(
          inArray(
            installments.id,
            future.map((i) => i.id),
          ),
        );
    }
    const trimmed = input.reason?.trim();
    const reason = trimmed === undefined || trimmed === '' ? null : trimmed;
    const [row] = await tx
      .update(enrollments)
      .set({ status: 'withdrawn', withdrawnAt: sql`now()`, withdrawnBy: actor.userId, withdrawReason: reason })
      .where(eq(enrollments.id, eid))
      .returning();
    const member = row ? await this.accounts.contactOf(row.userId) : null;
    if (!row || !member) throw new Error('en.withdraw : inscription ou compte introuvable');

    await this.outbox.publish(tx, {
      type: 'member.withdrawn',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'enrollment', id: eid },
      payload: { enrollmentId: eid, reason },
    });
    recordAudit({
      entityType: 'enrollment',
      entityId: eid,
      before: { status: current.status },
      after: { status: 'withdrawn', reason, canceledInstallments: future.length },
    });
    return toEnrollment(row, project, member, today);
  }
}
