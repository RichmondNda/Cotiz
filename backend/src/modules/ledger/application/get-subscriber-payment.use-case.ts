import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { SubscriberPaymentDetail } from '@cotiz/contracts';
import { payments as t } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import { subscriberEnrollmentsOf } from '../../members/members.public.js';
import { subscriberPaymentMethodsOf, toPaymentMethod } from '../../tenancy/tenancy.public.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { subscriberPaymentsOf } from './subscriber-payments.js';

/**
 * me.payment (lot 3.3, espace subscriber) : une déclaration de la personne connectée, avec son moyen et son
 * commentaire. Appartenance souscripteur active ; inscription retirée comprise, en lecture seule (`enrollmentWithdrawn`,
 * décision du 2026-11-10) ; sinon, comme un paiement d'autrui ou inconnu, 404.
 */
@Injectable()
export class GetSubscriberPaymentUseCase {
  async execute(id: string): Promise<z.infer<typeof SubscriberPaymentDetail>> {
    const paymentId = id.toLowerCase();
    const [row] = await currentTx()
      .select({
        enrollmentId: t.enrollmentId,
        projectId: t.projectId,
        associationId: t.associationId,
        paymentMethodId: t.paymentMethodId,
        comment: t.comment,
      })
      .from(t)
      .where(and(eq(t.id, paymentId), eq(t.userId, requireActor().userId)));
    if (!row) throw new DomainProblem('not_found');
    const entry = (await subscriberEnrollmentsOf({ projectId: row.projectId, includeWithdrawn: true })).find(
      (e) => e.row.id === row.enrollmentId && e.association.id === row.associationId,
    );
    if (!entry) throw new DomainProblem('not_found');
    const association = entry.association;
    const [view] = await subscriberPaymentsOf(
      [entry.row.id],
      {
        projects: new Map([[entry.project.id, { id: entry.project.id, name: entry.project.name }]]),
        associations: new Map([
          [association.id, { id: association.id, name: association.name, logoFileId: association.logoFileId }],
        ]),
        withdrawnEnrollments: new Set(entry.row.status === 'withdrawn' ? [entry.row.id] : []),
      },
      { ids: [paymentId] },
    );
    if (!view) throw new DomainProblem('not_found');
    const method = row.paymentMethodId
      ? (await subscriberPaymentMethodsOf([association.id])).find(
          (m) => m.id === row.paymentMethodId && m.associationId === association.id,
        )
      : undefined;
    return { ...view, paymentMethod: method ? toPaymentMethod(method) : null, comment: row.comment };
  }
}
