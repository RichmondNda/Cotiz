import { Injectable } from '@nestjs/common';
import type { Association } from '@cotiz/contracts';
import { associations } from '@cotiz/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { toAssociation } from './association-profile.js';
import { contextAssociationId, ownAssociationOf } from './association-records.js';
import { activePaymentMethodsCount, lockPaymentMethods } from './payment-method-records.js';

/**
 * as.onb : clôture de l'onboarding (dernière étape de /asso/bienvenue). L'avancement n'est pas mémorisé, il se déduit
 * des données (choix Q1) : le profil est toujours complet (colonnes obligatoires) ; il faut au moins un moyen de
 * paiement actif, sinon 422 `onboarding_incomplete`. Clôture (Q2) : date posée, `onboarding → active` (domain-rules
 * § 8 ; un autre statut est conservé), version incrémentée, association.onboarded. Déjà close : renvoyée telle quelle,
 * sans événement ; deux clôtures concurrentes n'en font qu'une (mise à jour conditionnelle).
 */
@Injectable()
export class CompleteOnboardingUseCase {
  constructor(private readonly outbox: OutboxService) {}

  async execute(aid: string): Promise<Association> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    const current = await ownAssociationOf(associationId);
    if (!current) throw new DomainProblem('not_found');
    if (current.onboardingCompletedAt) return toAssociation(current);

    await lockPaymentMethods(associationId);
    if ((await activePaymentMethodsCount(associationId)) === 0) throw new DomainProblem('onboarding_incomplete');

    const [completed] = await currentTx()
      .update(associations)
      .set({
        onboardingCompletedAt: sql`now()`,
        status: sql`CASE WHEN ${associations.status} = 'onboarding' THEN 'active'::associations_status ELSE ${associations.status} END`,
        version: sql`${associations.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(associations.id, associationId), isNull(associations.onboardingCompletedAt)))
      .returning();
    if (!completed) {
      // Close entre-temps par une requête concurrente : son résultat.
      const closed = await ownAssociationOf(associationId);
      if (!closed) throw new DomainProblem('not_found');
      return toAssociation(closed);
    }
    await this.outbox.publish(currentTx(), {
      type: 'association.onboarded',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'association', id: associationId },
      payload: { associationId },
    });
    return toAssociation(completed);
  }
}
