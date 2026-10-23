import { Injectable } from '@nestjs/common';
import type { AssociationCreated, CreateAssociationInput } from '@cotiz/contracts';
import { ManagerAccounts } from '../../identity/identity.public.js';
import { platformAssociationOf } from '../../tenancy/tenancy.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { newAssociationDetail } from './association-views.js';
import { ProvisionAssociation } from './provision-association.js';

/**
 * pf.asso.create : création directe d'une association par la plateforme, sans demande ; même mise en place que
 * l'approbation (ProvisionAssociation), essai possible, slug choisi (`slug_taken`) ou déduit du nom. Le code
 * d'activation d'un nouveau compte est toujours émis (chiffré) ; le message prêt n'est renvoyé qu'avec
 * « identifiants maintenant » (`issueCredentialsNow`). Événement `association.approved`, audit.
 */
@Injectable()
export class CreateAssociationUseCase {
  constructor(
    private readonly provision: ProvisionAssociation,
    private readonly accounts: ManagerAccounts,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('association.create')
  async execute(input: CreateAssociationInput): Promise<AssociationCreated> {
    const actor = requireActor();
    const { association, owner, subscription } = input;
    const billingPeriod = subscription.billingPeriod ?? 'monthly';
    const provisioned = await this.provision.execute({
      association: {
        name: association.name,
        type: association.type,
        city: association.city,
        country: association.country,
        registrationNumber: association.registrationNumber ?? null,
        description: association.description ?? null,
        contactEmail: owner.email,
        contactPhone: owner.phone,
        slug: association.slug,
      },
      owner,
      subscription: {
        planId: subscription.planId,
        billingPeriod,
        startsOn: subscription.startsOn,
        managerSeats: subscription.managerSeats ?? null,
        trialDays: subscription.trialDays,
      },
      decidedBy: actor.userId,
      planField: 'subscription.planId',
    });
    const { associationId, ownerUserId } = provisioned;

    await this.outbox.publish(currentTx(), {
      type: 'association.approved',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'association', id: associationId },
      payload: { associationId, ownerUserId, planId: subscription.planId },
    });
    const detail = await newAssociationDetail(associationId, actor.userId);
    recordAudit({
      entityType: 'association',
      entityId: associationId,
      associationId,
      after: {
        slug: detail.slug,
        name: detail.name,
        ownerUserId,
        planId: subscription.planId,
        billingPeriod,
        trialDays: subscription.trialDays,
        managerSeats: subscription.managerSeats ?? null,
        subscriptionStartsOn: subscription.startsOn,
        ownerAccount: provisioned.handoff ? 'activation_code_issued' : 'existing_account',
        credentialsHandedNow: input.issueCredentialsNow && provisioned.handoff !== null,
      },
    });
    return { association: detail, handoff: input.issueCredentialsNow ? provisioned.handoff : null };
  }

  /**
   * Rejeu de la même requête (même Idempotency-Key) : la fiche actuelle de l'association créée, et le message prêt reconstruit
   * (code déchiffré tant qu'il sert) si la requête le demandait. Rien n'est réécrit, rien n'est audité.
   */
  async replay(
    reference: { id: string; ownerUserId: string },
    input: CreateAssociationInput,
  ): Promise<AssociationCreated> {
    const actor = requireActor();
    const associationId = reference.id;
    const association = await platformAssociationOf(associationId);
    if (!association) throw new DomainProblem('not_found');
    // Owner d'origine (mémorisé), pas l'owner actuel : un transfert ne peut pas faire servir le code d'une autre personne.
    const handoff = input.issueCredentialsNow
      ? await this.accounts.reissuedHandoff(reference.ownerUserId, actor.userId, association.createdAt)
      : null;
    return { association: await newAssociationDetail(associationId, actor.userId), handoff };
  }
}
