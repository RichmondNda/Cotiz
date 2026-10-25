import { Injectable } from '@nestjs/common';
import type { PaymentMethodList } from '@cotiz/contracts';
import type { z } from 'zod';
import { contextAssociationId } from './association-records.js';
import { paymentMethodsOf, toPaymentMethod } from './payment-method-records.js';

/** as.pm.list : moyens de paiement de l'association, actifs ou non, dans l'ordre d'affichage. */
@Injectable()
export class ListPaymentMethodsUseCase {
  async execute(aid: string): Promise<z.infer<typeof PaymentMethodList>> {
    return { items: (await paymentMethodsOf(contextAssociationId(aid))).map(toPaymentMethod) };
  }
}
