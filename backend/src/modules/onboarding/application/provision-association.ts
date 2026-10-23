import { Injectable } from '@nestjs/common';
import type { Handoff } from '@cotiz/contracts';
import { sql } from 'drizzle-orm';
import { grantOwnership, ownsAnAssociation, platformRoleOf } from '../../access/access.public.js';
import { isActivePlan, openSubscription, type NewSubscription } from '../../billing/billing.public.js';
import { ManagerAccounts, type ManagerContact } from '../../identity/identity.public.js';
import { createAssociation, type NewAssociation } from '../../tenancy/tenancy.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

export interface ProvisionInput {
  association: NewAssociation;
  owner: ManagerContact;
  subscription: Omit<NewSubscription, 'associationId'>;
  /** Personne de la plateforme qui décide (émetteur du code). */
  decidedBy: string;
  /** Mot personnel ajouté au message prêt. */
  personalMessage?: string | undefined;
  /** Champ du plan dans la requête, pour `validation_failed` (`planId`, `subscription.planId`). */
  planField: string;
}

export interface Provisioned {
  associationId: string;
  ownerUserId: string;
  /** Message prêt avec le code d'activation ; `null` si le responsable a déjà un compte actif (rattaché). */
  handoff: Handoff | null;
}

/**
 * Mise en place d'un espace (architecture/04 §4.1), dans la transaction plateforme de l'appelant : association en
 * `onboarding`, premier abonnement, compte du responsable créé (code d'activation) ou rattaché par son email,
 * appartenance owner active. Partagée par l'approbation d'une demande et la création directe.
 * Refus, avant toute écriture : plan absent ou inactif (`validation_failed`), adresse déjà owner
 * (`email_already_owner`), compte existant non actif ou du personnel plateforme (`owner_account_unavailable`) : l'email
 * d'une demande n'est pas vérifié, un code émis pour le compte d'une autre personne le livrerait au demandeur.
 */
@Injectable()
export class ProvisionAssociation {
  constructor(private readonly accounts: ManagerAccounts) {}

  async execute(input: ProvisionInput): Promise<Provisioned> {
    // Deux mises en place simultanées pour la même adresse : la seconde attend et voit l'owner de la première.
    await currentTx().execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`provision:owner:${input.owner.email.toLowerCase()}`}, 0))`,
    );
    if (!(await isActivePlan(input.subscription.planId))) {
      throw new DomainProblem('validation_failed', { fields: { [input.planField]: 'inactive_plan' } });
    }
    const existing = await this.accounts.findByEmail(input.owner.email);
    if (existing) {
      if (await ownsAnAssociation(existing.userId)) throw new DomainProblem('email_already_owner');
      if (existing.status !== 'active' || (await platformRoleOf(existing.userId)) !== null) {
        throw new DomainProblem('owner_account_unavailable');
      }
    }

    const { id: associationId } = await createAssociation(input.association);
    const subscription = await openSubscription({ ...input.subscription, associationId });
    // Plan archivé entre la vérification et le verrou du plan : la transaction est annulée.
    if (!subscription) {
      throw new DomainProblem('validation_failed', { fields: { [input.planField]: 'inactive_plan' } });
    }
    const ownerUserId = existing?.userId ?? (await this.accounts.create(input.owner));
    await grantOwnership(associationId, ownerUserId, input.decidedBy);
    const handoff = existing
      ? null
      : await this.accounts.issueActivation(ownerUserId, input.decidedBy, input.personalMessage);
    return { associationId, ownerUserId, handoff };
  }
}
