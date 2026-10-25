import { Injectable } from '@nestjs/common';
import type { SchedulePreview, SchedulePreviewInput } from '@cotiz/contracts';
import type { z } from 'zod';
import { DomainProblem } from '../../../shared/http/index.js';
import { currencyProblems, previewOf, scheduleInputOf, scheduleOf } from '../domain/project-terms.js';
import { associationCurrencyOf, contextAssociationId } from './project-records.js';

/**
 * pr.preview : échéancier de conditions saisies, par generateSchedule() (la fonction de l'aperçu du front), dans la
 * devise de l'association ; conditions invalides : 422 sur le champ. Total au-delà des entiers sûrs : `null`, comme le
 * front (pr.create le refuse). Aucune écriture.
 */
@Injectable()
export class PreviewScheduleUseCase {
  async execute(aid: string, input: z.infer<typeof SchedulePreviewInput>): Promise<z.infer<typeof SchedulePreview>> {
    const currency = await associationCurrencyOf(contextAssociationId(aid));
    const problems = currencyProblems(input, currency);
    if (Object.keys(problems).length > 0) throw new DomainProblem('validation_failed', { fields: problems });
    const lines = scheduleOf(scheduleInputOf(input, { enrolledFrom: input.enrolledFrom, horizon: input.horizon }));
    if (!Array.isArray(lines)) throw new DomainProblem('validation_failed', { fields: lines });
    // Dates fixes sans aucune échéance dans le projet : refusées comme par pr.create. Un souscripteur entré après la
    // dernière date n'a, lui, simplement aucune échéance.
    if (
      input.scheduleType === 'fixed' &&
      (input.enrolledFrom === undefined ? lines : scheduleOf(scheduleInputOf(input))).length === 0
    ) {
      throw new DomainProblem('validation_failed', { fields: { endDate: 'no_installment' } });
    }
    return previewOf(lines, input.scheduleType, currency);
  }
}
