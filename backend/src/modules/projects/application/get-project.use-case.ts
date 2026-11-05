import { Injectable } from '@nestjs/common';
import type { Project } from '@cotiz/contracts';
import { ProjectFigures } from '../../reporting/reporting.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { contextAssociationId, projectOf, toProject } from './project-records.js';

/**
 * pr.get : un projet de l'association, indicateurs par ProjectFigures ; d'une autre association ou inconnu : 404. ETag
 * par IfMatchInterceptor (version seule : les indicateurs n'y entrent pas).
 */
@Injectable()
export class GetProjectUseCase {
  constructor(private readonly figures: ProjectFigures) {}

  async execute(aid: string, pid: string): Promise<Project> {
    const associationId = contextAssociationId(aid);
    const row = await projectOf(associationId, pid);
    if (!row) throw new DomainProblem('not_found');
    const [project] = await this.figures.withStats(associationId, [await toProject(row)]);
    if (!project) throw new Error('pr.get : projet sans indicateurs');
    return project;
  }
}
