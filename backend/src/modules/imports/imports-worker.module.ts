import { Module } from '@nestjs/common';
import { QuotaService } from '../billing/billing.public.js';
import { IdentityCliModule } from '../identity/identity.public.js';
import { CreateEnrollmentUseCase } from '../members/members.public.js';
import { AnalyzeImportUseCase } from './application/analyze-import.use-case.js';
import { ClassifyImportUseCase } from './application/classify-import.use-case.js';
import { ExecuteImportUseCase } from './application/execute-import.use-case.js';
import { FailImportUseCase } from './application/fail-import.use-case.js';
import { ImportJobsConsumer } from './events/import-jobs.consumer.js';
import { ImportsProcessor } from './events/imports.processor.js';

/**
 * Partie worker du module imports (file `imports`, jobs.yaml) : `import.created` → analyse du fichier, `import.mapped`
 * → classement des lignes, `import.commit_requested` → exécution par le cas d'usage d'inscription (en.create, module
 * members), avec ses dépendances (comptes et codes d'activation du module identity, quotas).
 */
@Module({
  imports: [IdentityCliModule],
  providers: [
    QuotaService,
    CreateEnrollmentUseCase,
    AnalyzeImportUseCase,
    ClassifyImportUseCase,
    ExecuteImportUseCase,
    FailImportUseCase,
    ImportJobsConsumer,
    ImportsProcessor,
  ],
  exports: [AnalyzeImportUseCase, ClassifyImportUseCase, ExecuteImportUseCase],
})
export class ImportsWorkerModule {}
