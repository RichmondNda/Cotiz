import { createHash } from 'node:crypto';
import { files } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import type { StorageService } from '../../../shared/storage/index.js';
import { currentTx, type TenantDatabase } from '../../../shared/tenant-context/index.js';

/** Plafond de relecture d'un PDF déjà stocké (un document pèse quelques centaines de Ko). */
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const sha256 = (content: Buffer) => createHash('sha256').update(content).digest('hex');

export type LegalPurpose = 'contract_pdf' | 'invoice_pdf' | 'receipt_pdf';

/** Le PDF d'une ligne `files` est-il encore à produire ? Dans le contexte de l'association (RLS) ; absente : erreur. */
export async function isPdfPending(fileId: string, associationId: string): Promise<boolean> {
  const [file] = await currentTx()
    .select({ scanStatus: files.scanStatus })
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.associationId, associationId)));
  if (!file) throw new Error(`document ${fileId} : fichier du PDF introuvable`);
  return file.scanStatus === 'pending';
}

/**
 * Écrit **une seule fois** un document légal rendu (architecture/08 : jamais régénéré), en espace system : ligne
 * `files` verrouillée (une génération concurrente attend, puis la voit `clean`), objet écrit dans `cotiz-legal`
 * (WORM) à sa clé s'il n'y est pas déjà (`If-None-Match`), `files` complété (empreinte et taille du contenu conservé,
 * `clean`). Renvoie `false` si un autre passage l'a déjà produit. Un échec avant le COMMIT laisse le PDF en attente :
 * le job est repris (idempotent).
 */
export function storeLegalPdf(
  db: TenantDatabase,
  storage: StorageService,
  target: { fileId: string; associationId: string; purpose: LegalPurpose },
  pdf: Buffer,
): Promise<boolean> {
  return db.withTenantContext({ space: 'system' }, async () => {
    const tx = currentTx();
    const [file] = await tx
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, target.fileId),
          eq(files.associationId, target.associationId),
          eq(files.purpose, target.purpose),
        ),
      )
      .for('update');
    if (file?.scanStatus !== 'pending') return false;
    // Jamais réécrit : un objet déjà présent (écrit avant un COMMIT perdu) est celui qui fait foi.
    const stored = await storage.putObjectOnce(file.bucket, file.objectKey, pdf, 'application/pdf', MAX_PDF_BYTES);
    await tx
      .update(files)
      .set({ scanStatus: 'clean', sha256: sha256(stored), sizeBytes: stored.length })
      .where(eq(files.id, file.id));
    return true;
  });
}
