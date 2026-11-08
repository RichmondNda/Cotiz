import { Module } from '@nestjs/common';
import { CONFIG, type Config } from '../../config.js';
import { UserProfiles } from '../identity/identity.public.js';
import { GenerateContractPdfUseCase } from './application/generate-contract-pdf.use-case.js';
import { PDF_RENDERER, type PdfRenderer } from './domain/pdf-renderer.js';
import { ContractSignedConsumer } from './events/contract-signed.consumer.js';
import { DocumentsProcessor } from './events/documents.processor.js';
import { GotenbergRenderer } from './infra/gotenberg-renderer.js';

/** Sans GOTENBERG_URL (hors production) : tout rendu échoue, le PDF reste en attente. Jamais produit par défaut. */
const missingRenderer: PdfRenderer = {
  render: () => Promise.reject(new Error('PDF : GOTENBERG_URL manquante')),
};

/** Module documents (worker) : PDF produits par le serveur, file `documents` (architecture/08). Lot 4.1 : contrats. */
@Module({
  providers: [
    {
      provide: PDF_RENDERER,
      inject: [CONFIG],
      useFactory: (config: Config): PdfRenderer =>
        config.GOTENBERG_URL ? new GotenbergRenderer(config.GOTENBERG_URL) : missingRenderer,
    },
    UserProfiles,
    GenerateContractPdfUseCase,
    ContractSignedConsumer,
    DocumentsProcessor,
  ],
})
export class DocumentsWorkerModule {}
