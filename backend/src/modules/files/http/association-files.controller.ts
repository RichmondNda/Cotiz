import { Body, Controller, Get, Header, HttpCode, Param, Post, Redirect } from '@nestjs/common';
import { AssociationIdParams, AssociationParams, AssociationUploadRequest } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { CompleteUploadUseCase } from '../application/complete-upload.use-case.js';
import { GetFileUseCase } from '../application/get-file.use-case.js';
import { RequestUploadUseCase } from '../application/request-upload.use-case.js';

/**
 * as.upload et as.file (décision 24) : dépôt et lecture des fichiers d'une association sous son URL. L'association vient
 * du `{aid}` vérifié par MembershipGuard (contexte de la requête) ; mêmes cas d'usage que fl.upload et fl.get.
 */
@Controller('associations/:aid')
export class AssociationFilesController {
  constructor(
    private readonly requestUpload: RequestUploadUseCase,
    private readonly completeUpload: CompleteUploadUseCase,
    private readonly getFile: GetFileUseCase,
  ) {}

  @Post('uploads')
  @Endpoint('as.upload', 'create')
  @Can('association.settings.manage')
  @HttpCode(201)
  create(@Param() params: unknown, @Body() body: unknown) {
    parseInput(AssociationParams, params);
    return this.requestUpload.execute(parseInput(AssociationUploadRequest, body));
  }

  @Post('uploads/:id/complete')
  @Endpoint('as.upload', 'complete')
  @Can('association.settings.manage')
  @HttpCode(202)
  complete(@Param() params: unknown) {
    return this.completeUpload.execute(parseInput(AssociationIdParams, params).id);
  }

  /** 302 vers une URL signée ; jamais mise en cache (elle expire en 5 min et dépend de l'acteur). */
  @Get('files/:id')
  @Endpoint('as.file', 'get')
  @Can('association.read')
  @Redirect()
  @Header('Cache-Control', 'no-store')
  async get(@Param() params: unknown) {
    return { url: await this.getFile.execute(parseInput(AssociationIdParams, params).id), statusCode: 302 };
  }
}
