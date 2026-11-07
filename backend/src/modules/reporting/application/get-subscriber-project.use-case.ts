import { Injectable } from '@nestjs/common';
import { ENDPOINTS, type PaymentMethod } from '@cotiz/contracts';
import type { z } from 'zod';
import { subscriberPaymentsOf } from '../../ledger/ledger.public.js';
import { installmentView, type SubscriberEnrollment, subscriberEnrollmentsOf } from '../../members/members.public.js';
import { subscriberProjectLinksOf, termsOf } from '../../projects/projects.public.js';
import { subscriberPaymentMethodsOf, toPaymentMethod } from '../../tenancy/tenancy.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { associationRefOf, subscriberCard } from './subscriber-cards.js';

type Detail = z.infer<(typeof ENDPOINTS)['me.project']['operations']['get']['response']['body']>;

/**
 * me.project : un projet du souscripteur connecté (mb-projet) — sa carte, les conditions, tout l'échéancier, ses
 * paiements déclarés (plus récents d'abord) et les moyens de paiement retenus avec leurs consignes.
 * Projet où la personne n'a pas d'inscription non retirée (autre souscripteur, autre association, retrait, inconnu) :
 * 404 `not_found`, sans rien dire de son existence (architecture/02).
 */
@Injectable()
export class GetSubscriberProjectUseCase {
  async execute(projectId: string): Promise<Detail> {
    const [entry] = await subscriberEnrollmentsOf({ projectId: projectId.toLowerCase() });
    if (!entry) throw new DomainProblem('not_found');
    const association = associationRefOf(entry);
    return {
      ...subscriberCard(entry),
      terms: termsOf(entry.project),
      installments: entry.lines.map((line) => installmentView(line, entry.project, entry.today)),
      payments: await subscriberPaymentsOf([entry.row.id], {
        projects: new Map([[entry.project.id, entry.project]]),
        associations: new Map([[association.id, association]]),
      }),
      paymentMethods: await paymentMethodsOf(entry),
      // Contrats : lot 4.1. D'ici là, seule une inscription en attente de signature en demande un.
      contract: { required: entry.row.status === 'pending_signature', signedAt: null },
    };
  }
}

/**
 * Moyens retenus par le projet, dans l'ordre de l'association, avec la consigne propre au projet si elle existe ;
 * aucun lien : les moyens de l'association (choix Q7). Seuls les moyens actifs sont présentés (pour payer).
 */
async function paymentMethodsOf(entry: SubscriberEnrollment): Promise<PaymentMethod[]> {
  const links = await subscriberProjectLinksOf(entry.project.id);
  const methods = (await subscriberPaymentMethodsOf([entry.association.id])).filter(
    (m) => m.associationId === entry.association.id && m.isActive,
  );
  if (links.length === 0) return methods.map(toPaymentMethod);
  const chosen = new Map(links.map((l) => [l.paymentMethodId, l.instructionsOverride]));
  return methods
    .filter((m) => chosen.has(m.id))
    .map((m) => {
      const method = toPaymentMethod(m);
      return { ...method, instructions: chosen.get(m.id) ?? method.instructions };
    });
}
