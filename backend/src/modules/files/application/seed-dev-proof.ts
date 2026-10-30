import { createHash } from 'node:crypto';
import { files } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Config } from '../../../config.js';
import { assertDevSeedAllowed } from '../../../shared/dev-seed/index.js';
import { BUCKETS, type StorageService } from '../../../shared/storage/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { storedObjectKey } from '../domain/stored-object-key.js';
import { thumbnail } from '../infra/content-inspection.js';

/** Image neutre d'une preuve de développement : aucune capture réelle, aucune donnée personnelle. */
const PROOF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480">
  <rect width="100%" height="100%" fill="#f2f2f2"/>
  <text x="50%" y="50%" font-family="sans-serif" font-size="36" fill="#555" text-anchor="middle">Preuve de démonstration</text>
</svg>`;

/**
 * seed-dev (lot 2.4) : preuve d'un paiement de référence, fichier de l'association déjà analysé (`clean`), déposé à sa
 * clé définitive comme après l'analyse du worker. Dans le contexte de l'association. Idempotente : un fichier déjà
 * présent n'est ni redéposé ni modifié. Sans analyse antivirus : refusée hors développement et test, et sans
 * COTIZ_DEV_SEED=1, quel que soit l'appelant.
 */
export async function seedDevProof(
  storage: StorageService,
  config: Pick<Config, 'NODE_ENV' | 'COTIZ_DEV_SEED'>,
  proof: { id: string; associationId: string; ownerUserId: string; originalName: string },
): Promise<void> {
  assertDevSeedAllowed(config);
  const tx = currentTx();
  const [existing] = await tx.select({ id: files.id }).from(files).where(eq(files.id, proof.id));
  if (existing) return;
  const content = await sharp(Buffer.from(PROOF_SVG)).jpeg({ quality: 80 }).toBuffer();
  const file = { id: proof.id, associationId: proof.associationId, purpose: 'payment_proof' as const };
  const bucket = BUCKETS.payment_proof;
  const key = storedObjectKey(file, 'jpg');
  await storage.putObject(bucket, key, content, 'image/jpeg');
  const thumb = await thumbnail(content, 'image/jpeg');
  if (thumb) await storage.putObject(bucket, `${key}.thumb.webp`, thumb, 'image/webp');
  await tx.insert(files).values({
    ...file,
    ownerUserId: proof.ownerUserId,
    bucket,
    objectKey: key,
    originalName: proof.originalName,
    mimeType: 'image/jpeg',
    sizeBytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
    scanStatus: 'clean',
  });
}
