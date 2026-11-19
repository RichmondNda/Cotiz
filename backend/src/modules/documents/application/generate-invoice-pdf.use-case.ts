import { Inject, Injectable, Logger } from '@nestjs/common';
import { invoiceDocument } from '@cotiz/pdf-templates';
import { invoiceDocumentOf } from '../../billing/billing.public.js';
import { StorageService } from '../../../shared/storage/index.js';
import { TenantDatabase } from '../../../shared/tenant-context/index.js';
import { PDF_RENDERER, type PdfRenderer } from '../domain/pdf-renderer.js';
import { isPdfPending, storeLegalPdf } from './legal-pdf.js';

/**
 * PDF d'une facture d'abonnement (file `documents`, `subscription.invoice_issued`, lot 4.6), produit **une seule
 * fois** (architecture/08) : données lues dans le contexte de l'association (rien si le PDF est déjà produit), rendu
 * par Gotenberg hors transaction, puis écriture unique dans `cotiz-legal` (`storeLegalPdf`).
 */
@Injectable()
export class GenerateInvoicePdfUseCase {
  private readonly logger = new Logger(GenerateInvoicePdfUseCase.name);

  constructor(
    private readonly db: TenantDatabase,
    private readonly storage: StorageService,
    @Inject(PDF_RENDERER) private readonly renderer: PdfRenderer,
  ) {}

  async execute(job: { associationId: string; invoiceId: string }): Promise<void> {
    const { associationId, invoiceId } = job;
    const prepared = await this.db.withTenantContext({ space: 'association', associationId }, async () => {
      const document = await invoiceDocumentOf(associationId, invoiceId);
      if (!document) return null;
      return (await isPdfPending(document.pdfFileId, associationId)) ? document : null;
    });
    if (!prepared) return;

    const pdf = await this.renderer.render(invoiceDocument(prepared.input));
    const written = await storeLegalPdf(
      this.db,
      this.storage,
      { fileId: prepared.pdfFileId, associationId, purpose: 'invoice_pdf' },
      pdf,
    );
    if (written) this.logger.log({ msg: 'PDF de la facture produit', invoiceId, fileId: prepared.pdfFileId });
  }
}
