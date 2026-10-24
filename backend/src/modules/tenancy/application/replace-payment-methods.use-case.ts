import { Injectable } from '@nestjs/common';
import type { PaymentMethod, PaymentMethodInput, PaymentMethodList } from '@cotiz/contracts';
import { associationPaymentMethods } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { contextAssociationId } from './association-records.js';
import { paymentMethodsOf, toAuditedPaymentMethod, toPaymentMethod } from './payment-method-records.js';

/** JSON à clés triées : `details` relu de jsonb n'a pas l'ordre de clés de la saisie. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * as.pm › replace : remplacement complet des moyens de paiement (onboarding étape 3, paramètres). `details` déjà
 * validé par type (PaymentMethodInput) ; l'ordre de la liste donne `position`. Moyen avec `id` : mis à jour (il doit
 * être de cette association, une seule fois, sinon 422) ; sans `id` : créé ; absent de la liste : supprimé (choix Q5,
 * aucun moyen n'est encore référencé ; lot 2.2 : désactiver un moyen référencé). Deux remplacements concurrents
 * s'ordonnent par un verrou de transaction. Audité ; association.updated si la liste change.
 */
@Injectable()
export class ReplacePaymentMethodsUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('association.payment_methods.replace')
  async execute(aid: string, items: z.infer<typeof PaymentMethodInput>[]): Promise<z.infer<typeof PaymentMethodList>> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    await currentTx().execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-methods:${associationId}`}, 0))`,
    );
    const before = (await paymentMethodsOf(associationId)).map(toPaymentMethod);

    const known = new Set(before.map((m) => m.id));
    const seen = new Set<string>();
    items.forEach((item, i) => {
      if (item.id === undefined) return;
      if (!known.has(item.id))
        throw new DomainProblem('validation_failed', { fields: { [`items.${String(i)}.id`]: 'not_found' } });
      if (seen.has(item.id))
        throw new DomainProblem('validation_failed', { fields: { [`items.${String(i)}.id`]: 'duplicate' } });
      seen.add(item.id);
    });

    const after: PaymentMethod[] = items.map((item, position) => ({
      id: item.id ?? newId(),
      kind: item.kind,
      label: item.label,
      details: item.details,
      instructions: item.instructions ?? null,
      position,
      isActive: item.isActive,
    }));
    const changed = canonical(before) !== canonical(after);

    if (changed) {
      const tx = currentTx();
      const kept = after.map((m) => m.id);
      await tx
        .delete(associationPaymentMethods)
        .where(
          and(
            eq(associationPaymentMethods.associationId, associationId),
            kept.length > 0 ? notInArray(associationPaymentMethods.id, kept) : undefined,
          ),
        );
      for (const method of after) {
        const values = { ...method, associationId };
        const { id: _id, ...update } = values;
        await tx
          .insert(associationPaymentMethods)
          .values(values)
          .onConflictDoUpdate({ target: associationPaymentMethods.id, set: update });
      }
      await this.outbox.publish(tx, {
        type: 'association.updated',
        associationId,
        actorUserId: actor.userId,
        aggregate: { type: 'association', id: associationId },
        payload: { associationId, changedFields: ['paymentMethods'] },
      });
    }
    recordAudit({
      entityType: 'association',
      entityId: associationId,
      associationId,
      before: { paymentMethods: before.map(toAuditedPaymentMethod) },
      after: { paymentMethods: after.map(toAuditedPaymentMethod) },
    });
    return { items: after };
  }
}
