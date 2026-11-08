import { Injectable } from '@nestjs/common';
import type { CreateProjectInput, Project } from '@cotiz/contracts';
import { projects } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import type { z } from 'zod';
import { QuotaService } from '../../billing/billing.public.js';
import { assertContractsFeature, createProjectContract } from '../../contracts/contracts.public.js';
import { isUsableAssociationFile } from '../../files/files.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { currencyProblems, projectScheduleOf } from '../domain/project-terms.js';
import { paymentMethodProblems, replaceProjectPaymentMethods } from './project-payment-methods.js';
import { associationCurrencyOf, contextAssociationId, toProject } from './project-records.js';

type Input = z.infer<typeof CreateProjectInput>;

/**
 * pr.create : projet en brouillon dans la devise de l'association. Conditions contrôlées par generateSchedule()
 * (422 sur le champ) ; contrat (étape 5 de l'assistant, lot 4.1) : fonctionnalité `contracts` du plan
 * (`feature_disabled`), écrit avec le projet, verrouillé aussitôt si l'association signe (`contract.locked`) ; moyens de
 * paiement de l'association, actifs, une fois chacun (Q7) ; couverture déposée par pr.upload et analysée saine ; quota
 * du plan (Q6). Idempotence par l'intercepteur (`Idempotency-Key`), project.created par l'outbox, création auditée.
 */
@Injectable()
export class CreateProjectUseCase {
  constructor(
    private readonly quotas: QuotaService,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('project.create')
  async execute(aid: string, input: Input): Promise<Project> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    if (input.contract !== undefined) await assertContractsFeature(associationId);
    const currency = await associationCurrencyOf(associationId);
    // Devise contrôlée sur le corps reçu (un fonds d'entrée à 0 dans une autre devise est refusé, comme par pr.preview).
    const currencyIssues = currencyProblems(input, currency);
    if (Object.keys(currencyIssues).length > 0) {
      throw new DomainProblem('validation_failed', { fields: currencyIssues });
    }
    // Cycle roulant : pas de fin (endDate ignorée) ; fonds d'entrée à 0 : aucun (domain-rules § 2).
    const terms = {
      ...input,
      endDate: input.scheduleType === 'rolling' ? null : input.endDate,
      entryFee: input.entryFee?.amount === 0 ? null : input.entryFee,
    };
    const schedule = projectScheduleOf(terms, currency);
    if (!Array.isArray(schedule)) throw new DomainProblem('validation_failed', { fields: schedule });

    const methodProblems = await paymentMethodProblems(associationId, input.paymentMethods);
    if (Object.keys(methodProblems).length > 0) {
      throw new DomainProblem('validation_failed', { fields: methodProblems });
    }
    const coverFileId = input.coverFileId ?? null;
    if (coverFileId !== null && !(await isUsableAssociationFile(coverFileId, 'cover'))) {
      throw new DomainProblem('validation_failed', { fields: { coverFileId: 'invalid' } });
    }

    await this.quotas.assert(associationId, 'projects');
    const tx = currentTx();
    const [row] = await tx
      .insert(projects)
      .values({
        id: newId(),
        associationId,
        name: input.name,
        description: input.description,
        coverFileId,
        requiredSubscribers: input.requiredSubscribers,
        entryFeeAmount: terms.entryFee ? BigInt(terms.entryFee.amount) : null,
        installmentAmount: BigInt(terms.installmentAmount.amount),
        frequency: terms.frequency,
        dueDay: terms.dueDay,
        scheduleType: terms.scheduleType,
        startDate: terms.startDate,
        endDate: terms.endDate,
        graceDays: input.graceDays,
        currency,
        createdBy: actor.userId,
      })
      .returning();
    if (!row) throw new Error('pr.create : aucune ligne insérée');
    await replaceProjectPaymentMethods(associationId, row.id, input.paymentMethods);

    await this.outbox.publish(tx, {
      type: 'project.created',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'project', id: row.id },
      payload: { projectId: row.id },
    });
    const contract = input.contract
      ? await createProjectContract(this.outbox, {
          associationId,
          projectId: row.id,
          actorUserId: actor.userId,
          contract: input.contract,
        })
      : null;
    const project = await toProject(row);
    const { stats: _stats, ...after } = project;
    recordAudit({ entityType: 'project', entityId: row.id, associationId, after });
    if (contract) {
      recordAudit({
        entityType: 'contract',
        entityId: contract.id,
        associationId,
        after: {
          projectId: row.id,
          bodyTemplate: contract.bodyTemplate,
          signerName: contract.associationSignerName,
          signerTitle: contract.associationSignerTitle,
          lockedAt: contract.lockedAt?.toISOString() ?? null,
        },
      });
    }
    return project;
  }
}
