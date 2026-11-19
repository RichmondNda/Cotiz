import { Inject, Injectable, Logger } from '@nestjs/common';
import { receiptDocument } from '@cotiz/pdf-templates';
import { PaymentReceipts } from '../../ledger/ledger.public.js';
import { StorageService } from '../../../shared/storage/index.js';
import { TenantDatabase } from '../../../shared/tenant-context/index.js';
import { PDF_RENDERER, type PdfRenderer } from '../domain/pdf-renderer.js';
import { isPdfPending, storeLegalPdf } from './legal-pdf.js';

/**
 * Reçu PDF d'un paiement validé (file `documents`, `payment.validated` différé, lot 4.6), produit **une seule fois** :
 * dans le contexte de l'association, le registre revérifie que le paiement est toujours validé une fois le délai
 * d'annulation écoulé et réserve le fichier (rien si le PDF est déjà produit) ; rendu par Gotenberg hors transaction,
 * puis écriture unique dans `cotiz-legal` (`storeLegalPdf`). Trop tôt : `retryAt` (le job est différé d'autant).
 */
@Injectable()
export class GenerateReceiptPdfUseCase {
  private readonly logger = new Logger(GenerateReceiptPdfUseCase.name);

  constructor(
    private readonly db: TenantDatabase,
    private readonly storage: StorageService,
    private readonly receipts: PaymentReceipts,
    @Inject(PDF_RENDERER) private readonly renderer: PdfRenderer,
  ) {}

  async execute(job: { associationId: string; paymentId: string }, now = new Date()): Promise<{ retryAt?: Date }> {
    const { associationId, paymentId } = job;
    const prepared = await this.db.withTenantContext({ space: 'association', associationId }, async () => {
      const preparation = await this.receipts.prepare(associationId, paymentId, now);
      if (preparation.status !== 'ready') return preparation;
      return (await isPdfPending(preparation.fileId, associationId)) ? preparation : ({ status: 'skip' } as const);
    });
    if (prepared.status === 'early') return { retryAt: prepared.retryAt };
    if (prepared.status === 'skip') return {};

    const pdf = await this.renderer.render(receiptDocument(prepared.input));
    const written = await storeLegalPdf(
      this.db,
      this.storage,
      { fileId: prepared.fileId, associationId, purpose: 'receipt_pdf' },
      pdf,
    );
    if (written) this.logger.log({ msg: 'reçu de paiement produit', paymentId, fileId: prepared.fileId });
    return {};
  }
}
