import type { ErrorCode } from '../generated/error-codes.js';
import type { DB_ENUMS } from '../generated/db-enums.js';

type FilePurpose = (typeof DB_ENUMS)['files_purpose'][number];

/** Taille maximale d'un fichier déposé (architecture/08 ; errors.yaml : file_too_large). */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

const IMAGES = ['image/jpeg', 'image/png'] as const;
const SPREADSHEETS = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] as const;

/**
 * Types acceptés au dépôt, par usage (architecture/08 : JPG, PNG, PDF ; CSV/XLSX pour imports et relevés). Les
 * contrats signés, factures et exports sont produits par le serveur : jamais déposés.
 */
export const UPLOAD_MIME_TYPES: Readonly<Record<FilePurpose, readonly string[]>> = {
  payment_proof: [...IMAGES, 'application/pdf'],
  logo: IMAGES,
  cover: IMAGES,
  import_source: SPREADSHEETS,
  bank_statement: SPREADSHEETS,
  contract_pdf: [],
  invoice_pdf: [],
  export: [],
};

/** Motif de refus d'un dépôt déclaré, `null` s'il est acceptable. Le contenu réel est revérifié par le worker. */
export function uploadRejection(upload: {
  purpose: FilePurpose;
  mimeType: string;
  sizeBytes: number;
}): Extract<ErrorCode, 'file_too_large' | 'file_type_not_allowed'> | null {
  if (!UPLOAD_MIME_TYPES[upload.purpose].includes(upload.mimeType)) return 'file_type_not_allowed';
  if (upload.sizeBytes > UPLOAD_MAX_BYTES) return 'file_too_large';
  return null;
}
