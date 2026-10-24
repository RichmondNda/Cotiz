import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { AssociationIdParams, AssociationParams, ProjectUploadRequest } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { CompleteUploadUseCase } from '../application/complete-upload.use-case.js';
import { RequestUploadUseCase } from '../application/request-upload.use-case.js';

/**
 * pr.upload : dépôt de l'image de couverture d'un projet par les gestionnaires qui gèrent les projets (as.upload reste à
 * l'owner). Mêmes cas d'usage qu'as.upload ; lecture par as.file.
 */
@Controller('associations/:aid/projects/uploads')
export class ProjectFilesController {
  constructor(
    private readonly requestUpload: RequestUploadUseCase,
    private readonly completeUpload: CompleteUploadUseCase,
  ) {}

  @Post()
  @Endpoint('pr.upload', 'create')
  @Can('projects.manage')
  @HttpCode(201)
  create(@Param() params: unknown, @Body() body: unknown) {
    parseInput(AssociationParams, params);
    return this.requestUpload.execute(parseInput(ProjectUploadRequest, body));
  }

  @Post(':id/complete')
  @Endpoint('pr.upload', 'complete')
  @Can('projects.manage')
  @HttpCode(202)
  complete(@Param() params: unknown) {
    return this.completeUpload.execute(parseInput(AssociationIdParams, params).id);
  }
}
