import type { StoredFile } from '@cotiz/contracts';
import type { files } from '@cotiz/db';
import type { z } from 'zod';

type FileRow = typeof files.$inferSelect;

/** Ligne `files` → `StoredFile` du contrat. */
export function toStoredFile(row: FileRow): z.infer<typeof StoredFile> {
  return {
    id: row.id,
    purpose: row.purpose,
    fileName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    scanStatus: row.scanStatus,
    createdAt: row.createdAt.toISOString(),
  };
}
