import { Injectable } from '@nestjs/common';
import type { Project } from '@cotiz/contracts';
import { DomainProblem } from '../../../shared/http/index.js';
import { contextAssociationId, projectOf, toProject } from './project-records.js';

/** pr.get : un projet de l'association ; d'une autre association ou inconnu : 404. ETag par IfMatchInterceptor. */
@Injectable()
export class GetProjectUseCase {
  async execute(aid: string, pid: string): Promise<Project> {
    const row = await projectOf(contextAssociationId(aid), pid);
    if (!row) throw new DomainProblem('not_found');
    return toProject(row);
  }
}
