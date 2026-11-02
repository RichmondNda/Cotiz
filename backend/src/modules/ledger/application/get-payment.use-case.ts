import { Injectable } from '@nestjs/common';
import { type PaymentDetail, RejectionReason } from '@cotiz/contracts';
import { payments as t } from '@cotiz/db';
import { canRevert, revertDeadline } from '@cotiz/domain';
import { and, desc, eq, ne } from 'drizzle-orm';
import { SubscriberAccounts } from '../../identity/identity.public.js';
import {
  associationToday,
  contextAssociationId,
  installmentsByEnrollment,
  installmentView,
} from '../../members/members.public.js';
import { toPaymentMethod } from '../../tenancy/tenancy.public.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { declaredLines, type PaymentLine, paymentRefsOf, paymentSummary } from './payment-views.js';

const lineKey = (l: PaymentLine) => `${l.installmentId}:${String(l.amount)}`;
const sameLines = (a: readonly PaymentLine[], b: readonly PaymentLine[]) =>
  a.length === b.length && a.map(lineKey).sort().join() === b.map(lineKey).sort().join();

/**
 * lg.pay.get : un paiement de l'association (RLS : celui d'une autre association n'existe pas, 404), avec son moyen,
 * son motif de rejet, l'échéancier de l'inscription au jour de l'association et les 3 derniers paiements validés de
 * la même inscription. Répartition ajustée : validé avec une répartition confirmée différente de la déclaration.
 * Annulable jusqu'à 10 min après la validation (incluses), par son auteur seulement (canRevert).
 */
@Injectable()
export class GetPaymentUseCase {
  constructor(private readonly accounts: SubscriberAccounts) {}

  async execute(aid: string, payId: string): Promise<PaymentDetail> {
    const associationId = contextAssociationId(aid);
    const tx = currentTx();
    const [row] = await tx.select().from(t).where(eq(t.id, payId));
    if (row?.associationId !== associationId) throw new DomainProblem('not_found');
    const recent = await tx
      .select()
      .from(t)
      .where(
        and(
          eq(t.associationId, associationId),
          eq(t.enrollmentId, row.enrollmentId),
          eq(t.status, 'validated'),
          ne(t.id, row.id),
        ),
      )
      .orderBy(desc(t.declaredAt), desc(t.id))
      .limit(3);
    const refs = await paymentRefsOf(associationId, [row, ...recent], this.accounts);
    const project = refs.projects.get(row.projectId);
    if (!project) throw new Error(`paiement ${row.id} : projet introuvable`);
    const today = await associationToday(associationId);
    const schedule = (await installmentsByEnrollment([row.enrollmentId])).get(row.enrollmentId) ?? [];
    const lines = refs.lines.get(row.id) ?? [];
    const method = row.paymentMethodId ? refs.methods.get(row.paymentMethodId) : undefined;
    return {
      ...paymentSummary(row, refs),
      paymentMethod: method ? toPaymentMethod(method) : null,
      comment: row.comment,
      allocationAdjusted:
        row.status === 'validated' &&
        !sameLines(
          declaredLines(lines),
          lines.filter((l) => l.state === 'confirmed'),
        ),
      rejection: row.rejectionReasonCode
        ? { reasonCode: RejectionReason.parse(row.rejectionReasonCode), message: row.rejectionMessage }
        : null,
      schedule: schedule.map((i) => installmentView(i, project, today)),
      recentPayments: recent.map((p) => paymentSummary(p, refs)),
      revertibleUntil: canRevert(row, requireActor().userId, new Date())
        ? (revertDeadline(row)?.toISOString() ?? null)
        : null,
      version: row.version,
    };
  }
}
