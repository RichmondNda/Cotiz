import { Injectable, Logger } from '@nestjs/common';
import { files } from '@cotiz/db';
import { and, eq, lt } from 'drizzle-orm';
import { StorageService } from '../../../shared/storage/index.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';

/**
 * Purge housekeeping des exports expirés (jobs.yaml « exports expirés », lot 4.6), en espace system : lignes `files`
 * d'usage `export` dont l'expiration (7 jours) est passée, puis leurs objets dans `cotiz-exports` après le COMMIT
 * (un objet égaré expire avec son compartiment). Aucune donnée financière : un export se redemande. Un fichier expiré
 * pas encore purgé n'est déjà plus servi (`fl.get`, `as.file` : 404).
 */
@Injectable()
export class PurgeExpiredFilesUseCase {
  private readonly logger = new Logger(PurgeExpiredFilesUseCase.name);

  constructor(
    private readonly db: TenantDatabase,
    private readonly storage: StorageService,
  ) {}

  async execute(now: Date): Promise<void> {
    const expired = await this.db.withTenantContext({ space: 'system' }, () =>
      currentTx()
        .delete(files)
        .where(and(eq(files.purpose, 'export'), lt(files.expiresAt, now)))
        .returning({ bucket: files.bucket, objectKey: files.objectKey }),
    );
    for (const file of expired) await this.storage.deleteObject(file.bucket, file.objectKey);
    if (expired.length > 0) this.logger.log({ msg: 'exports expirés purgés', count: expired.length });
  }
}
