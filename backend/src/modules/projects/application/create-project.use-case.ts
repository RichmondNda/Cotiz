import { Injectable } from '@nestjs/common';
import type { CreateProjectInput, Project } from '@cotiz/contracts';
import { projectPaymentMethods, projects } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import type { z } from 'zod';
import { QuotaService } from '../../billing/billing.public.js';
import { isUsableAssociationFile } from '../../files/files.public.js';
import { lockPaymentMethods, paymentMethodsOf } from '../../tenancy/tenancy.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { currencyProblems, type FieldProblems, projectScheduleOf } from '../domain/project-terms.js';
import { associationCurrencyOf, contextAssociationId, toProject } from './project-records.js';

type Input = z.infer<typeof CreateProjectInput>;

/**
 * pr.create : projet en brouillon dans la devise de l'association. Conditions contrôlées par generateSchedule()
 * (422 sur le champ) ; contrat refusé avant le lot 4.1 (choix Q1) ; moyens de paiement de l'association, actifs, une
 * fois chacun (Q7) ; couverture déposée par pr.upload et analysée saine ; quota du plan (Q6). Idempotence par
 * l'intercepteur (`Idempotency-Key`), project.created par l'outbox, création auditée.
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
    if (input.contract !== undefined) {
      throw new DomainProblem('validation_failed', { fields: { contract: 'not_available' } });
    }
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

    // Même verrou qu'as.pm : un moyen retenu ici n'est pas supprimé en même temps.
    await lockPaymentMethods(associationId);
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
    if (input.paymentMethods.length > 0) {
      await tx.insert(projectPaymentMethods).values(
        input.paymentMethods.map((m) => ({
          projectId: row.id,
          paymentMethodId: m.paymentMethodId,
          associationId,
          instructionsOverride: m.instructionsOverride,
        })),
      );
    }

    await this.outbox.publish(tx, {
      type: 'project.created',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'project', id: row.id },
      payload: { projectId: row.id },
    });
    const project = await toProject(row);
    const { stats: _stats, ...after } = project;
    recordAudit({ entityType: 'project', entityId: row.id, associationId, after });
    return project;
  }
}

/** Moyens de paiement choisis : de l'association et actifs (`not_available`), chacun une fois (`duplicate`). */
async function paymentMethodProblems(associationId: string, chosen: Input['paymentMethods']): Promise<FieldProblems> {
  if (chosen.length === 0) return {};
  const active = new Set((await paymentMethodsOf(associationId)).filter((m) => m.isActive).map((m) => m.id));
  const seen = new Set<string>();
  const problems: FieldProblems = {};
  chosen.forEach((m, i) => {
    const field = `paymentMethods.${String(i)}.paymentMethodId`;
    if (!active.has(m.paymentMethodId)) problems[field] = 'not_available';
    else if (seen.has(m.paymentMethodId)) problems[field] = 'duplicate';
    seen.add(m.paymentMethodId);
  });
  return problems;
}
