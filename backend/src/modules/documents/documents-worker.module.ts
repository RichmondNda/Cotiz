import { Module } from '@nestjs/common';
import { UserProfiles } from '../identity/identity.public.js';
import { GenerateContractPdfUseCase } from './application/generate-contract-pdf.use-case.js';
import { GenerateInvoicePdfUseCase } from './application/generate-invoice-pdf.use-case.js';
import { pdfRendererProvider } from './documents.public.js';
import { ContractSignedConsumer } from './events/contract-signed.consumer.js';
import { DocumentsProcessor } from './events/documents.processor.js';
import { InvoiceIssuedConsumer } from './events/invoice-issued.consumer.js';

/** Module documents (worker) : PDF produits par le serveur, file `documents` (architecture/08). Lot 4.1 : contrats ; lot 4.6 : factures. */
@Module({
  providers: [
    pdfRendererProvider,
    UserProfiles,
    GenerateContractPdfUseCase,
    GenerateInvoicePdfUseCase,
    ContractSignedConsumer,
    InvoiceIssuedConsumer,
    DocumentsProcessor,
  ],
})
export class DocumentsWorkerModule {}
