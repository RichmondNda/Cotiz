import { Injectable, Logger } from '@nestjs/common';
import { files } from '@cotiz/db';
import { and, eq, inArray, like, lt } from 'drizzle-orm';
import { BUCKETS, StorageService } from '../../../shared/storage/index.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';
import { UPLOAD_SPACE } from '../domain/upload-policy.js';

const DAY_MS = 24 * 3600 * 1000;
const QUARANTINE = 'quarantine/';

/** Usages déposés par le navigateur (seuls concernés : les PDF du serveur ne passent jamais par la quarantaine). */
const UPLOAD_PURPOSES = Object.keys(UPLOAD_SPACE) as (keyof typeof UPLOAD_SPACE)[];
/** Compartiments où le navigateur dépose (quarantaine). */
const UPLOAD_BUCKETS = [...new Set(UPLOAD_PURPOSES.map((purpose) => BUCKETS[purpose]))];
/** Paquets de clés par requête (limite des paramètres SQL). */
const BATCH = 1_000;

/**
 * Purge housekeeping des fichiers orphelins (jobs.yaml, lot 0.5), en espace system :
 * 1. dépôts du navigateur restés `pending` plus de 24 h, confirmés ou non (analyse jamais aboutie) : ligne et objet en
 *    quarantaine supprimés (rien ne les référence : une preuve n'est acceptée que `clean`) ; une analyse en cours garde
 *    la ligne (verrou). Seuls les usages déposables, et seulement sous `quarantine/` : un fichier produit par le
 *    serveur (contrat, facture, export) n'est jamais concerné, même laissé `pending` ;
 * 2. objets restés en quarantaine plus de 24 h sans ligne en attente (suppression après analyse en échec, dépôt
 *    remplacé) : supprimés.
 * Seul le préfixe `quarantine/` est concerné : fichiers analysés et miniatures ne sont jamais touchés.
 */
@Injectable()
export class PurgeOrphanFilesUseCase {
  private readonly logger = new Logger(PurgeOrphanFilesUseCase.name);

  constructor(
    private readonly db: TenantDatabase,
    private readonly storage: StorageService,
  ) {}

  async execute(now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - DAY_MS);
    const stale = await this.db.withTenantContext({ space: 'system' }, () =>
      currentTx()
        .delete(files)
        .where(
          and(
            eq(files.scanStatus, 'pending'),
            lt(files.createdAt, cutoff),
            inArray(files.purpose, UPLOAD_PURPOSES),
            like(files.objectKey, `${QUARANTINE}%`),
          ),
        )
        .returning({ bucket: files.bucket, objectKey: files.objectKey }),
    );
    // Après le COMMIT : un échec ici laisse un objet égaré, repris au passage suivant.
    for (const file of stale) {
      if (file.objectKey.startsWith(QUARANTINE)) await this.storage.deleteObject(file.bucket, file.objectKey);
    }

    let strays = 0;
    for (const bucket of UPLOAD_BUCKETS) {
      const old = (await this.storage.listObjects(bucket, QUARANTINE)).filter((o) => o.lastModified < cutoff);
      for (let i = 0; i < old.length; i += BATCH) {
        const batch = old.slice(i, i + BATCH);
        const pending = await this.db.withTenantContext({ space: 'system' }, () =>
          currentTx()
            .select({ objectKey: files.objectKey })
            .from(files)
            .where(
              and(
                eq(files.bucket, bucket),
                eq(files.scanStatus, 'pending'),
                inArray(
                  files.objectKey,
                  batch.map((o) => o.key),
                ),
              ),
            ),
        );
        const referenced = new Set(pending.map((p) => p.objectKey));
        for (const object of batch) {
          if (referenced.has(object.key)) continue;
          await this.storage.deleteObject(bucket, object.key);
          strays++;
        }
      }
    }
    this.logger.log(
      `fichiers orphelins : ${String(stale.length)} dépôt(s) abandonné(s), ${String(strays)} objet(s) égaré(s)`,
    );
  }
}
