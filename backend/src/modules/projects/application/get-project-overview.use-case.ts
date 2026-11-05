import { Injectable } from '@nestjs/common';
import type { ProjectOverview } from '@cotiz/contracts';
import type { z } from 'zod';
import { ProjectFigures } from '../../reporting/reporting.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { contextAssociationId, projectOf } from './project-records.js';

/**
 * pr.overview : synthèse d'un projet (mg-projet-overview) ; d'une autre association ou inconnu : 404. Chiffres par
 * ProjectFigures (reporting) : mêmes inscriptions, échéances et calculs que pr.get, rp.report et le tableau de bord.
 */
@Injectable()
export class GetProjectOverviewUseCase {
  constructor(private readonly figures: ProjectFigures) {}

  async execute(aid: string, pid: string): Promise<z.infer<typeof ProjectOverview>> {
    const associationId = contextAssociationId(aid);
    const row = await projectOf(associationId, pid);
    if (!row) throw new DomainProblem('not_found');
    return this.figures.overview(associationId, row);
  }
}
