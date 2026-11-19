import { files } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

/** Fichier source d'un import (lot 4.4), tel que l'import le contrôle puis le lit. */
export interface ImportSource {
  purpose: (typeof files.purpose.enumValues)[number];
  mimeType: string;
  scanStatus: 'pending' | 'clean' | 'infected';
  bucket: string;
  objectKey: string;
  createdAt: Date;
}

/**
 * Fichier `id` de l'association du contexte (RLS et contrôle ici) ; d'une autre association ou inconnu : `null`. La
 * clé de l'objet n'est définitive qu'une fois le fichier analysé sain (`clean`).
 */
export async function importSourceOf(id: string): Promise<ImportSource | null> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId === undefined) {
    throw new Error('importSourceOf : contexte d’une association attendu');
  }
  const [row] = await currentTx()
    .select({
      associationId: files.associationId,
      purpose: files.purpose,
      mimeType: files.mimeType,
      scanStatus: files.scanStatus,
      bucket: files.bucket,
      objectKey: files.objectKey,
      createdAt: files.createdAt,
    })
    .from(files)
    .where(eq(files.id, id));
  if (row?.associationId !== context.associationId) return null;
  const { associationId: _a, ...source } = row;
  return source;
}
