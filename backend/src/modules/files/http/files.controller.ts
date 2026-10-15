import { Body, Controller, Get, Header, HttpCode, Param, Post, Redirect } from '@nestjs/common';
import { IdParams, UploadRequest } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { CompleteUploadUseCase } from '../application/complete-upload.use-case.js';
import { GetFileUseCase } from '../application/get-file.use-case.js';
import { RequestUploadUseCase } from '../application/request-upload.use-case.js';

/** fl.upload et fl.get — permission `authenticated`. */
@Controller()
export class FilesController {
  constructor(
    private readonly requestUpload: RequestUploadUseCase,
    private readonly completeUpload: CompleteUploadUseCase,
    private readonly getFile: GetFileUseCase,
  ) {}

  @Post('uploads')
  @Endpoint('fl.upload', 'create')
  @Can('authenticated')
  @HttpCode(201)
  create(@Body() body: unknown) {
    return this.requestUpload.execute(parseInput(UploadRequest, body));
  }

  @Post('uploads/:id/complete')
  @Endpoint('fl.upload', 'complete')
  @Can('authenticated')
  @HttpCode(202)
  complete(@Param() params: unknown) {
    return this.completeUpload.execute(parseInput(IdParams, params).id);
  }

  /** 302 vers une URL signée ; jamais mise en cache (elle expire en 5 min et dépend de l'acteur). */
  @Get('files/:id')
  @Endpoint('fl.get', 'get')
  @Can('authenticated')
  @Redirect()
  @Header('Cache-Control', 'no-store')
  async get(@Param() params: unknown) {
    return { url: await this.getFile.execute(parseInput(IdParams, params).id), statusCode: 302 };
  }
}
