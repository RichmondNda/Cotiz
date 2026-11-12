import { Module } from '@nestjs/common';
import { QuotaService } from '../billing/billing.public.js';
import { CommitImportUseCase } from './application/commit-import.use-case.js';
import { CreateImportUseCase } from './application/create-import.use-case.js';
import { ReadImportUseCase } from './application/read-import.use-case.js';
import { UpdateImportMappingUseCase } from './application/update-import-mapping.use-case.js';
import { UpdateImportRowUseCase } from './application/update-import-row.use-case.js';
import { ImportsController } from './http/imports.controller.js';

/**
 * Module imports (endpoints.yaml : im.* ; lot 4.4), partie api : création depuis un fichier déposé, lecture,
 * correspondance des colonnes, correction des lignes, envoi. Analyse, classement et exécution : ImportsWorkerModule.
 */
@Module({
  controllers: [ImportsController],
  providers: [
    CreateImportUseCase,
    ReadImportUseCase,
    UpdateImportMappingUseCase,
    UpdateImportRowUseCase,
    CommitImportUseCase,
    QuotaService,
  ],
})
export class ImportsModule {}
