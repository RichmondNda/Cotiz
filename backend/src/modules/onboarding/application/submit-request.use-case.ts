import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AssociationRequestInput } from '@cotiz/contracts';
import { associationRequests } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { sql } from 'drizzle-orm';
import { DomainProblem } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { isActivePlan } from '../../billing/billing.public.js';
import { requestReference } from '../domain/request-reference.js';
import { AltchaReplayGuard } from '../infra/altcha-replay-guard.js';
import { AltchaService } from '../infra/altcha.service.js';

export interface RequestSubmitted {
  id: string;
  reference: string;
  contactEmail: string;
}

/**
 * pub.request : demande de création déposée depuis le site (espace public). Anti-abus sans service tiers (décision
 * n° 12) : défi ALTCHA vérifié puis consommé (usage unique), champ piège, limitation par IP (SubmitThrottleInterceptor).
 * Dépôt sans relecture (public_submit, INSERT sans RETURNING) : identifiant et référence calculés avant l'insertion.
 */
@Injectable()
export class SubmitRequestUseCase {
  constructor(
    private readonly altcha: AltchaService,
    private readonly replay: AltchaReplayGuard,
    private readonly outbox: OutboxService,
  ) {}

  async execute(input: AssociationRequestInput): Promise<RequestSubmitted> {
    const challenge = await this.altcha.verify(input.altcha);
    if (!challenge) throw new DomainProblem('challenge_failed');
    const now = new Date();
    const contactEmail = input.contact.email;

    const desiredPlanId = input.needs.desiredPlanId ?? null;
    if (desiredPlanId && !(await isActivePlan(desiredPlanId))) {
      throw new DomainProblem('validation_failed', { fields: { 'needs.desiredPlanId': 'unknown_plan' } });
    }
    if (!(await this.replay.claim(challenge, now))) throw new DomainProblem('challenge_failed');

    // Champ piège rempli : rien d'enregistré, mais les mêmes contrôles et la même réponse qu'une vraie demande (défi
    // consommé, plan vérifié), pour ne donner aucun signal au robot.
    if (input.website) {
      return { id: newId(), reference: requestReference(now.getUTCFullYear(), randomInt(1, 100_000)), contactEmail };
    }

    const tx = currentTx();
    const sequence = await tx.execute<{ n: string }>(sql`SELECT nextval('association_request_number_seq')::text AS n`);
    const number = sequence.rows[0]?.n;
    if (number === undefined) throw new Error('pub.request : séquence des références illisible');
    const id = newId();
    const reference = requestReference(now.getUTCFullYear(), BigInt(number));
    const { association, contact, needs } = input;
    await tx.insert(associationRequests).values({
      id,
      reference,
      associationName: association.name,
      associationType: association.type,
      city: association.city,
      country: association.country,
      registrationNumber: association.registrationNumber ?? null,
      activityDescription: association.activityDescription,
      contactFirstName: contact.firstName,
      contactLastName: contact.lastName,
      contactTitle: contact.title,
      contactEmail,
      contactPhone: contact.phone,
      estimatedSubscribers: needs.estimatedSubscribers,
      plannedProjects: needs.plannedProjects ?? null,
      desiredPlanId,
      acquisitionSource: needs.acquisitionSource ?? null,
      termsAcceptedAt: now,
      createdAt: now,
    });
    await this.outbox.publish(tx, {
      type: 'association.request_submitted',
      associationId: null,
      actorUserId: null,
      aggregate: { type: 'association_request', id },
      payload: { requestId: id, reference, associationName: association.name },
    });
    return { id, reference, contactEmail };
  }
}
