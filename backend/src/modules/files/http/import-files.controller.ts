import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { AssociationIdParams, AssociationParams, ImportUploadRequest } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { CompleteUploadUseCase } from '../application/complete-upload.use-case.js';
import { RequestUploadUseCase } from '../application/request-upload.use-case.js';

/**
 * im.upload (lot 4.4, décision 24) : dépôt du fichier d'un import par les gestionnaires qui gèrent les souscripteurs.
 * L'association vient du `{aid}` vérifié par MembershipGuard ; mêmes cas d'usage qu'as.upload et pr.upload. Le fichier
 * est lu ensuite par le worker des imports (im.flow), jamais servi au navigateur.
 */
@Controller('associations/:aid/imports/uploads')
export class ImportFilesController {
  constructor(
    private readonly requestUpload: RequestUploadUseCase,
    private readonly completeUpload: CompleteUploadUseCase,
  ) {}

  @Post()
  @Endpoint('im.upload', 'create')
  @Can('members.manage')
  @HttpCode(201)
  create(@Param() params: unknown, @Body() body: unknown) {
    parseInput(AssociationParams, params);
    return this.requestUpload.execute(parseInput(ImportUploadRequest, body));
  }

  @Post(':id/complete')
  @Endpoint('im.upload', 'complete')
  @Can('members.manage')
  @HttpCode(202)
  complete(@Param() params: unknown) {
    return this.completeUpload.execute(parseInput(AssociationIdParams, params).id);
  }
}
