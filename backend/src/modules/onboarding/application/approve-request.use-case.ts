import { Injectable } from '@nestjs/common';
import type { ApproveRequestInput, RequestApproved } from '@cotiz/contracts';
import { associationRequests as t } from '@cotiz/db';
import { eq, sql } from 'drizzle-orm';
import { ownerOf } from '../../access/access.public.js';
import { ManagerAccounts } from '../../identity/identity.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { ProvisionAssociation } from './provision-association.js';
import { referencesOf, type RequestRow, toDetail } from './request-views.js';

/**
 * pf.req.approve (architecture/04 §4.1) : en une transaction plateforme, verrouillée sur la demande, l'espace est mis
 * en place (ProvisionAssociation), la demande passe `approved` (décideur, note interne, association), audit et
 * `association.approved`. Une demande déjà traitée : `request_already_handled` (deux décisions simultanées : la seconde
 * attend le verrou puis voit la première). Aucun email : le message prêt est dans la réponse.
 */
@Injectable()
export class ApproveRequestUseCase {
  constructor(
    private readonly provision: ProvisionAssociation,
    private readonly accounts: ManagerAccounts,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('association_request.approve')
  async execute(id: string, input: ApproveRequestInput): Promise<RequestApproved> {
    const actor = requireActor();
    const tx = currentTx();
    const [request] = await tx.select().from(t).where(eq(t.id, id)).for('update');
    if (!request) throw new DomainProblem('not_found');
    if (request.status !== 'pending') throw new DomainProblem('request_already_handled');

    const planId = input.planId;
    const provisioned = await this.provision.execute({
      association: {
        name: request.associationName,
        type: request.associationType,
        city: request.city,
        country: request.country,
        registrationNumber: request.registrationNumber,
        description: request.activityDescription,
        contactEmail: request.contactEmail,
        contactPhone: request.contactPhone,
      },
      owner: {
        firstName: request.contactFirstName,
        lastName: request.contactLastName,
        email: request.contactEmail,
        phone: request.contactPhone,
      },
      subscription: {
        planId,
        billingPeriod: input.billingPeriod ?? 'monthly',
        startsOn: input.subscriptionStartsOn,
        managerSeats: input.managerSeats ?? null,
        trialDays: null,
      },
      decidedBy: actor.userId,
      personalMessage: input.personalMessage,
      planField: 'planId',
    });
    const { associationId, ownerUserId } = provisioned;

    const [row] = await tx
      .update(t)
      .set({
        status: 'approved',
        decidedBy: actor.userId,
        decidedAt: sql`now()`,
        internalNote: input.internalNote ?? null,
        associationId,
      })
      .where(eq(t.id, id))
      .returning();
    if (!row) throw new Error('pf.req.approve : demande disparue sous verrou');
    await this.outbox.publish(tx, {
      type: 'association.approved',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'association', id: associationId },
      payload: { associationId, ownerUserId, planId },
    });
    recordAudit({
      entityType: 'association_request',
      entityId: id,
      associationId,
      before: { status: 'pending' },
      after: {
        status: 'approved',
        associationId,
        ownerUserId,
        planId,
        billingPeriod: input.billingPeriod ?? 'monthly',
        managerSeats: input.managerSeats ?? null,
        subscriptionStartsOn: input.subscriptionStartsOn,
        ownerAccount: provisioned.handoff ? 'activation_code_issued' : 'existing_account',
      },
    });
    return this.response(row, provisioned.handoff);
  }

  /**
   * Rejeu de la même requête (même Idempotency-Key, pf.req.approve déjà réussie) : même réponse, reconstruite depuis la
   * base, le code d'activation déchiffré tant qu'il sert encore. Rien n'est réécrit, rien n'est audité.
   */
  async replay(id: string, input: ApproveRequestInput): Promise<RequestApproved> {
    const [row] = await currentTx().select().from(t).where(eq(t.id, id));
    if (!row) throw new DomainProblem('not_found');
    if (row.status !== 'approved' || !row.associationId || !row.decidedBy || !row.decidedAt) {
      throw new DomainProblem('request_already_handled');
    }
    const owner = await ownerOf(row.associationId);
    const handoff = owner
      ? await this.accounts.reissuedHandoff(owner, row.decidedBy, row.decidedAt, input.personalMessage)
      : null;
    return this.response(row, handoff);
  }

  private async response(row: RequestRow, handoff: RequestApproved['handoff']): Promise<RequestApproved> {
    if (!row.associationId) throw new Error('pf.req.approve : demande approuvée sans association');
    return { request: toDetail(row, await referencesOf([row])), associationId: row.associationId, handoff };
  }
}
