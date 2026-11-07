import { Injectable } from '@nestjs/common';
import type { AllocationPreviewInput, ENDPOINTS } from '@cotiz/contracts';
import { type Currency, DomainError, Money, previewAllocation } from '@cotiz/domain';
import type { z } from 'zod';
import { subscriberEnrollmentsOf } from '../../members/members.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { toLedger } from './payment-review.js';

type Preview = z.infer<(typeof ENDPOINTS)['me.alloc']['operations']['preview']['response']['body']>;

/**
 * me.alloc (architecture/04 § 4.4, étape 1) : répartition proposée par `previewAllocation()` (`proposeAllocation()`) sur les échéances de
 * l'inscription de la personne connectée à ce projet (soldes stockés : le montant en attente des autres déclarations
 * est déjà réservé), et reste dû ouvert après ce montant. Aucune écriture, aucun verrou : la déclaration revérifie
 * tout sous verrou. Projet sans inscription non retirée de la personne : 404, comme me.project.
 */
@Injectable()
export class PreviewAllocationUseCase {
  async execute(input: z.infer<typeof AllocationPreviewInput>): Promise<Preview> {
    const entries = await subscriberEnrollmentsOf({ projectId: input.projectId.toLowerCase() });
    // Une inscription par personne et par projet (UNIQUE project_id, user_id) : plus d'une = filtre défaillant.
    if (entries.length > 1) throw new Error('me.alloc : plusieurs inscriptions sur le même projet');
    const [entry] = entries;
    if (!entry) throw new DomainProblem('not_found');
    const currency = entry.project.currency as Currency;
    if (input.amount.currency !== currency) {
      throw new DomainProblem('validation_failed', { fields: { amount: 'currency_mismatch' } });
    }
    const installments = entry.lines.map((i) => toLedger(i, currency));
    try {
      const preview = previewAllocation(input.amount.amount, installments);
      return {
        allocations: preview.allocations.map((a) => ({
          installmentId: a.installmentId,
          amount: Money.of(a.amount, currency),
        })),
        remainingAfter: Money.of(preview.remainingAfter, currency),
      };
    } catch (error) {
      if (error instanceof DomainError && error.code === 'amount_exceeds_remaining') {
        const { maxAmount } = error.details as { maxAmount: number };
        throw new DomainProblem('amount_exceeds_remaining', { maxAmount });
      }
      if (error instanceof DomainError && error.code === 'invalid_amount') {
        throw new DomainProblem('validation_failed', { fields: { amount: 'invalid_amount' } });
      }
      throw error;
    }
  }
}
