import { Module } from '@nestjs/common';
import { IdentityCliModule, UserProfiles } from '../identity/identity.public.js';
import { PaymentReceipts } from '../ledger/ledger.public.js';
import { GenerateContractPdfUseCase } from './application/generate-contract-pdf.use-case.js';
import { GenerateInvoicePdfUseCase } from './application/generate-invoice-pdf.use-case.js';
import { GenerateReceiptPdfUseCase } from './application/generate-receipt-pdf.use-case.js';
import { pdfRendererProvider } from './documents.public.js';
import { ContractSignedConsumer } from './events/contract-signed.consumer.js';
import { DocumentsProcessor } from './events/documents.processor.js';
import { InvoiceIssuedConsumer } from './events/invoice-issued.consumer.js';
import { PaymentValidatedConsumer } from './events/payment-validated.consumer.js';

/** Module documents (worker) : PDF produits par le serveur, file `documents` (architecture/08). Lot 4.1 : contrats ; lot 4.6 : factures et reçus de paiement. */
@Module({
  imports: [IdentityCliModule],
  providers: [
    pdfRendererProvider,
    UserProfiles,
    GenerateContractPdfUseCase,
    GenerateInvoicePdfUseCase,
    PaymentReceipts,
    GenerateReceiptPdfUseCase,
    ContractSignedConsumer,
    InvoiceIssuedConsumer,
    PaymentValidatedConsumer,
    DocumentsProcessor,
  ],
})
export class DocumentsWorkerModule {}
