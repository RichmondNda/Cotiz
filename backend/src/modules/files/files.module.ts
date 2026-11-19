import { Module } from '@nestjs/common';
import { CompleteUploadUseCase } from './application/complete-upload.use-case.js';
import { GetFileUseCase } from './application/get-file.use-case.js';
import { RequestUploadUseCase } from './application/request-upload.use-case.js';
import { AssociationFilesController } from './http/association-files.controller.js';
import { FilesController } from './http/files.controller.js';
import { ImportFilesController } from './http/import-files.controller.js';
import { ProjectFilesController } from './http/project-files.controller.js';

/** Module storage (endpoints.yaml : fl.upload, fl.get, as.upload, as.file, pr.upload, im.upload ; architecture/08). */
@Module({
  controllers: [FilesController, AssociationFilesController, ProjectFilesController, ImportFilesController],
  providers: [RequestUploadUseCase, CompleteUploadUseCase, GetFileUseCase],
})
export class FilesModule {}
