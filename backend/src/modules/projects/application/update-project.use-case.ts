import { isDeepStrictEqual } from 'node:util';
import { Injectable } from '@nestjs/common';
import type { Project, ProjectInput } from '@cotiz/contracts';
import { projects, updateWithVersion } from '@cotiz/db';
import type { z } from 'zod';
import { isUsableAssociationFile } from '../../files/files.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, expectedVersion, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { EDITABLE_STATUSES } from '../domain/project-lifecycle.js';
import { currencyProblems, projectScheduleOf } from '../domain/project-terms.js';
import { paymentMethodProblems, replaceProjectPaymentMethods } from './project-payment-methods.js';
import { associationCurrencyOf, contextAssociationId, projectOf, toProject } from './project-records.js';

type Input = Partial<z.infer<typeof ProjectInput>>;

/** Conditions financières, figées au premier paiement validé (domain-rules § 9). */
const FINANCIAL = [
  'entryFee',
  'installmentAmount',
  'frequency',
  'dueDay',
  'scheduleType',
  'startDate',
  'endDate',
] as const;
/** Champs du contrat, dans son ordre (changedFields de project.updated, audit). */
const FIELDS = [
  ...FINANCIAL,
  'name',
  'description',
  'coverFileId',
  'requiredSubscribers',
  'graceDays',
  'paymentMethods',
] as const;

/**
 * pr.patch : modification d'un projet sous verrou optimiste (`If-Match`, 412) ; seuls les champs envoyés changent, la
 * version s'incrémente même sans changement. Conditions financières : contrôlées sur le projet entier comme à la
 * création, refusées une fois verrouillées si elles changent (409 `financial_terms_locked`, champ par champ) ; une
 * valeur renvoyée à l'identique est acceptée. Moyens de paiement et couverture contrôlés comme à la création. Projet
 * terminé ou archivé : 409 `invalid_state`. project.updated avec les champs modifiés, s'il y en a ; audit.
 */
@Injectable()
export class UpdateProjectUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('project.update')
  async execute(aid: string, pid: string, input: Input): Promise<Project> {
    const actor = requireActor();
    const version = expectedVersion();
    const associationId = contextAssociationId(aid);
    if (Object.keys(input).length === 0) throw new DomainProblem('validation_failed', { fields: { _: 'empty' } });
    // Verrouillé : le verrouillage des conditions (premier paiement validé) attend la fin de cette modification.
    const current = await projectOf(associationId, pid, { lock: true });
    if (!current) throw new DomainProblem('not_found');
    if (!EDITABLE_STATUSES.includes(current.status)) throw new DomainProblem('invalid_state');
    const before = await toProject(current);

    const currency = await associationCurrencyOf(associationId);
    const currencyIssues = currencyProblems(
      { installmentAmount: before.installmentAmount, entryFee: null, ...input },
      currency,
    );
    if (Object.keys(currencyIssues).length > 0) {
      throw new DomainProblem('validation_failed', { fields: currencyIssues });
    }
    // Conditions du projet après modification ; cycle roulant : pas de fin ; fonds d'entrée à 0 : aucun.
    const merged = { ...before, ...input };
    const terms = {
      ...merged,
      endDate: merged.scheduleType === 'rolling' ? null : merged.endDate,
      entryFee: merged.entryFee?.amount === 0 ? null : merged.entryFee,
    };
    const termsChanged = FINANCIAL.filter((f) => !isDeepStrictEqual(terms[f], before[f]));
    if (termsChanged.length > 0 && current.financialTermsLockedAt) {
      throw new DomainProblem('financial_terms_locked', {
        fields: Object.fromEntries(termsChanged.map((f) => [f, 'locked'])),
      });
    }
    if (termsChanged.length > 0) {
      const schedule = projectScheduleOf(terms, currency);
      if (!Array.isArray(schedule)) throw new DomainProblem('validation_failed', { fields: schedule });
    }
    if (input.paymentMethods) {
      const problems = await paymentMethodProblems(associationId, input.paymentMethods);
      if (Object.keys(problems).length > 0) throw new DomainProblem('validation_failed', { fields: problems });
    }
    const coverFileId = input.coverFileId;
    if (coverFileId && coverFileId !== current.coverFileId && !(await isUsableAssociationFile(coverFileId, 'cover'))) {
      throw new DomainProblem('validation_failed', { fields: { coverFileId: 'invalid' } });
    }

    const tx = currentTx();
    const updated = await updateWithVersion(
      tx,
      projects,
      { id: current.id, version },
      {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(coverFileId === undefined ? {} : { coverFileId }),
        ...(input.requiredSubscribers === undefined ? {} : { requiredSubscribers: input.requiredSubscribers }),
        ...(input.graceDays === undefined ? {} : { graceDays: input.graceDays }),
        ...(termsChanged.length === 0
          ? {}
          : {
              entryFeeAmount: terms.entryFee ? BigInt(terms.entryFee.amount) : null,
              installmentAmount: BigInt(terms.installmentAmount.amount),
              frequency: terms.frequency,
              dueDay: terms.dueDay,
              scheduleType: terms.scheduleType,
              startDate: terms.startDate,
              endDate: terms.endDate,
            }),
      },
    );
    if (!updated) throw new DomainProblem('not_found');
    if (input.paymentMethods) await replaceProjectPaymentMethods(associationId, current.id, input.paymentMethods);

    const after = await toProject(updated);
    const changed = FIELDS.filter((f) => !isDeepStrictEqual(before[f], after[f]));
    if (changed.length > 0) {
      await this.outbox.publish(tx, {
        type: 'project.updated',
        associationId,
        actorUserId: actor.userId,
        aggregate: { type: 'project', id: current.id },
        payload: { projectId: current.id, changedFields: changed },
      });
    }
    recordAudit({
      entityType: 'project',
      entityId: current.id,
      associationId,
      before: Object.fromEntries(changed.map((f) => [f, before[f]])),
      after: Object.fromEntries(changed.map((f) => [f, after[f]])),
    });
    return after;
  }
}
