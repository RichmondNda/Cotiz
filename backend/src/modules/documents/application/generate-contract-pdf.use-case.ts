import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { files } from '@cotiz/db';
import { contractDocument } from '@cotiz/pdf-templates';
import { and, eq } from 'drizzle-orm';
import { signedContractDocumentOf } from '../../contracts/contracts.public.js';
import { UserProfiles } from '../../identity/identity.public.js';
import { StorageService } from '../../../shared/storage/index.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';
import { PDF_RENDERER, type PdfRenderer } from '../domain/pdf-renderer.js';

/** Plafond de relecture d'un PDF déjà stocké (un contrat pèse quelques centaines de Ko). */
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const sha256 = (content: Buffer) => createHash('sha256').update(content).digest('hex');

/**
 * PDF d'un contrat signé (file `documents`, `contract.signed`) : contrat + page de preuve, produit **une seule fois**
 * (architecture/08 : jamais régénéré).
 * 1. Contexte de l'association : signature, texte rendu à nouveau et comparé à l'empreinte signée (sinon erreur) ;
 *    PDF déjà produit (`clean`) : rien à faire.
 * 2. Rendu par Gotenberg, hors transaction.
 * 3. Espace system : ligne `files` verrouillée (une génération concurrente attend, puis voit `clean`), objet écrit dans
 *    `cotiz-legal` (WORM) à sa clé s'il n'y est pas déjà (`If-None-Match`), `files` complété (empreinte et taille du
 *    contenu conservé, `clean`). Un échec avant le COMMIT
 *    laisse le PDF en attente : le job est repris (idempotent).
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
      const [file] = await currentTx()
        .select({ scanStatus: files.scanStatus })
        .from(files)
        .where(and(eq(files.id, document.pdfFileId), eq(files.associationId, associationId)));
      if (!file) throw new Error(`contrat signé ${signatureId} : fichier du PDF introuvable`);
      return file.scanStatus === 'pending' ? document : null;
    });
    if (!prepared) return;

    const pdf = await this.renderer.render(contractDocument(prepared.input));
    const written = await this.db.withTenantContext({ space: 'system' }, async () => {
      const tx = currentTx();
      const [file] = await tx
        .select()
        .from(files)
        .where(
          and(
            eq(files.id, prepared.pdfFileId),
            eq(files.associationId, associationId),
            eq(files.purpose, 'contract_pdf'),
          ),
        )
        .for('update');
      // Produit entre-temps par une autre génération : on ne réécrit jamais un PDF signé.
      if (file?.scanStatus !== 'pending') return false;
      // Jamais réécrit : un objet déjà présent (écrit avant un COMMIT perdu) est celui qui fait foi.
      const stored = await this.storage.putObjectOnce(
        file.bucket,
        file.objectKey,
        pdf,
        'application/pdf',
        MAX_PDF_BYTES,
      );
      await tx
        .update(files)
        .set({ scanStatus: 'clean', sha256: sha256(stored), sizeBytes: stored.length })
        .where(eq(files.id, file.id));
      return true;
    });
    if (written) this.logger.log({ msg: 'PDF du contrat signé produit', signatureId, fileId: prepared.pdfFileId });
  }
}
