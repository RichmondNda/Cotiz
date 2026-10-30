import { Injectable } from '@nestjs/common';
import type { InstallmentDetail } from '@cotiz/contracts';
import { allocations, installments, payments } from '@cotiz/db';
import { type Currency, Money } from '@cotiz/domain';
import { asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { SubscriberAccounts } from '../../identity/identity.public.js';
import { associationToday, contextAssociationId, installmentView } from '../../members/members.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

/**
 * lg.inst : une échéance de l'association (RLS : celle d'une autre association n'existe pas, 404), calculée au jour de
 * l'association, avec la personne, le projet et chaque répartition qui la vise (proposée, confirmée ou annulée), dans
 * l'ordre des déclarations.
 */
@Injectable()
export class GetInstallmentUseCase {
  constructor(private readonly accounts: SubscriberAccounts) {}

  async execute(aid: string, iid: string): Promise<z.infer<typeof InstallmentDetail>> {
    const associationId = contextAssociationId(aid);
    const tx = currentTx();
    const [row] = await tx.select().from(installments).where(eq(installments.id, iid));
    if (row?.associationId !== associationId) throw new DomainProblem('not_found');
    const project = await projectOf(associationId, row.projectId);
    const member = (await this.accounts.contactsOf([row.userId])).get(row.userId);
    if (!project || !member) throw new Error('lg.inst : projet ou compte d’une échéance introuvable');
    const currency = project.currency as Currency;
    const lines = await tx
      .select({
        paymentId: allocations.paymentId,
        amount: allocations.amount,
        state: allocations.state,
        paymentStatus: payments.status,
        paidOn: payments.paidOn,
        declaredAt: payments.declaredAt,
      })
      .from(allocations)
      .innerJoin(payments, eq(payments.id, allocations.paymentId))
      .where(eq(allocations.installmentId, row.id))
      .orderBy(asc(payments.declaredAt), asc(allocations.id));
    return {
      installment: installmentView(row, project, await associationToday(associationId)),
      member: { id: member.id, firstName: member.firstName, lastName: member.lastName },
      project: { id: project.id, name: project.name },
      allocations: lines.map((a) => ({
        paymentId: a.paymentId,
        amount: Money.fromDb(a.amount, currency),
        state: a.state,
        paymentStatus: a.paymentStatus,
        paidOn: a.paidOn,
        declaredAt: a.declaredAt.toISOString(),
      })),
    };
  }
}
