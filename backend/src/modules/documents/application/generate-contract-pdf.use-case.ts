import { Inject, Injectable, Logger } from '@nestjs/common';
import { contractDocument } from '@cotiz/pdf-templates';
import { signedContractDocumentOf } from '../../contracts/contracts.public.js';
import { UserProfiles } from '../../identity/identity.public.js';
import { StorageService } from '../../../shared/storage/index.js';
import { TenantDatabase } from '../../../shared/tenant-context/index.js';
import { PDF_RENDERER, type PdfRenderer } from '../domain/pdf-renderer.js';
import { isPdfPending, storeLegalPdf } from './legal-pdf.js';

/**
 * PDF d'un contrat signé (file `documents`, `contract.signed`) : contrat + page de preuve, produit **une seule fois**
 * (architecture/08 : jamais régénéré).
 * 1. Contexte de l'association : signature, texte rendu à nouveau et comparé à l'empreinte signée (sinon erreur) ;
 *    PDF déjà produit (`clean`) : rien à faire.
 * 2. Rendu par Gotenberg, hors transaction.
 * 3. Écriture unique dans `cotiz-legal` (WORM) et `files` complété : `storeLegalPdf` (legal-pdf.ts).
 */
@Injectable()
export class GenerateContractPdfUseCase {
  private readonly logger = new Logger(GenerateContractPdfUseCase.name);

  constructor(
    private readonly db: TenantDatabase,
    private readonly storage: StorageService,
    private readonly profiles: UserProfiles,
    @Inject(PDF_RENDERER) private readonly renderer: PdfRenderer,
  ) {}

  async execute(job: { associationId: string; signatureId: string }): Promise<void> {
    const { associationId, signatureId } = job;
    const prepared = await this.db.withTenantContext({ space: 'association', associationId }, async () => {
      const document = await signedContractDocumentOf(associationId, signatureId, this.profiles);
      if (!document) return null;
      return (await isPdfPending(document.pdfFileId, associationId)) ? document : null;
    });
    if (!prepared) return;

    const pdf = await this.renderer.render(contractDocument(prepared.input));
    const written = await storeLegalPdf(
      this.db,
      this.storage,
      { fileId: prepared.pdfFileId, associationId, purpose: 'contract_pdf' },
      pdf,
    );
    if (written) this.logger.log({ msg: 'PDF du contrat signé produit', signatureId, fileId: prepared.pdfFileId });
  }
}
