import { describe, expect, it } from 'vitest';
import { StoredFile } from '../endpoints/common.js';
import { UPLOAD_MAX_BYTES, uploadRejection } from './upload.js';

describe('règles de dépôt (architecture/08, errors.yaml)', () => {
  it('5 Mo au plus', () => {
    expect(UPLOAD_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(
      uploadRejection({ purpose: 'payment_proof', mimeType: 'application/pdf', sizeBytes: UPLOAD_MAX_BYTES }),
    ).toBeNull();
    expect(
      uploadRejection({ purpose: 'payment_proof', mimeType: 'application/pdf', sizeBytes: UPLOAD_MAX_BYTES + 1 }),
    ).toBe('file_too_large');
  });

  it.each([
    ['payment_proof', 'image/jpeg'],
    ['payment_proof', 'image/png'],
    ['payment_proof', 'application/pdf'],
    ['logo', 'image/png'],
    ['cover', 'image/jpeg'],
    ['import_source', 'text/csv'],
    ['import_source', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['bank_statement', 'text/csv'],
  ] as const)('%s accepte %s', (purpose, mimeType) => {
    expect(uploadRejection({ purpose, mimeType, sizeBytes: 1000 })).toBeNull();
  });

  it.each([
    ['payment_proof', 'image/heic'],
    ['payment_proof', 'text/csv'],
    ['logo', 'application/pdf'],
    ['logo', 'image/svg+xml'],
    ['import_source', 'application/pdf'],
  ] as const)('%s refuse %s', (purpose, mimeType) => {
    expect(uploadRejection({ purpose, mimeType, sizeBytes: 1000 })).toBe('file_type_not_allowed');
  });

  it.each(['contract_pdf', 'invoice_pdf', 'export'] as const)(
    '%s est produit par le serveur, jamais déposé',
    (purpose) => {
      expect(uploadRejection({ purpose, mimeType: 'application/pdf', sizeBytes: 1000 })).toBe('file_type_not_allowed');
    },
  );
});

describe('StoredFile', () => {
  const file = {
    id: '00000000-0000-7000-8000-0000000f0001',
    purpose: 'payment_proof',
    fileName: 'recu.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    scanStatus: 'pending',
    createdAt: '2026-10-10T08:00:00Z',
  } as const;

  it('empreinte absente tant que l’analyse n’est pas faite', () => {
    expect(StoredFile.parse({ ...file, sha256: null }).sha256).toBeNull();
  });

  it('empreinte SHA-256 hexadécimale une fois calculée', () => {
    expect(StoredFile.safeParse({ ...file, scanStatus: 'clean', sha256: 'a'.repeat(64) }).success).toBe(true);
    expect(StoredFile.safeParse({ ...file, scanStatus: 'clean', sha256: 'xyz' }).success).toBe(false);
  });
});
