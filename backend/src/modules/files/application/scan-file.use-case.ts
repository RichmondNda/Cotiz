import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { UPLOAD_MAX_BYTES } from '@cotiz/contracts';
import { files } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import { StorageService } from '../../../shared/storage/index.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';
import { storedObjectKey } from '../domain/stored-object-key.js';
import { VIRUS_SCANNER, type VirusScanner } from '../domain/virus-scanner.js';
import { inspectContent, thumbnail } from '../infra/content-inspection.js';

const sha256 = (content: Buffer) => createHash('sha256').update(content).digest('hex');

/**
 * Analyse d'un fichier déposé (worker, file `files`) : antivirus (clamd), type réel par octets magiques, images
 * réencodées sans EXIF, SHA-256 du contenu conservé, miniature, déplacement hors de la quarantaine ; `scan_status`
 * clean ou infected. Idempotente : un fichier déjà analysé n'est pas repris.
 *
 * Le contenu analysé est lu une fois en mémoire et c'est lui qui est écrit à la clé définitive : un remplacement de
 * l'objet en quarantaine pendant ou après l'analyse (l'URL de dépôt vit 5 min) n'est jamais conservé.
 */
@Injectable()
export class ScanFileUseCase {
  private readonly logger = new Logger(ScanFileUseCase.name);

  constructor(
    private readonly db: TenantDatabase,
    private readonly storage: StorageService,
    @Inject(VIRUS_SCANNER) private readonly scanner: VirusScanner,
  ) {}

  async execute(fileId: string): Promise<void> {
    const quarantine = await this.db.withTenantContext({ space: 'system' }, async () => {
      const tx = currentTx();
      // Verrou : deux analyses du même fichier (confirmation répétée) ne se chevauchent jamais.
      const [file] = await tx.select().from(files).where(eq(files.id, fileId)).for('update');
      if (file?.scanStatus !== 'pending') return null;
      const original = await this.storage.getObject(file.bucket, file.objectKey, UPLOAD_MAX_BYTES);
      // Rien en quarantaine (confirmé sans dépôt, ou déjà déplacé) : rien à analyser, le ménage s'en charge.
      if (!original) return null;

      const verdict = await this.scanner.scan(original);
      const inspection = verdict.infected ? { ok: false as const } : await inspectContent(original, file.mimeType);
      if (!inspection.ok) {
        await tx
          .update(files)
          .set({ scanStatus: 'infected', sha256: sha256(original) })
          .where(eq(files.id, file.id));
        // Identifiant et motif seulement : ni nom de fichier, ni contenu.
        const reason = verdict.infected ? `antivirus (${verdict.signature})` : 'type réel différent du type déclaré';
        this.logger.warn(`fichier ${file.id} refusé : ${reason}`);
        return { bucket: file.bucket, key: file.objectKey };
      }

      const key = storedObjectKey(file, inspection.extension);
      await this.storage.putObject(file.bucket, key, inspection.content, file.mimeType);
      const thumb = await thumbnail(inspection.content, file.mimeType);
      if (thumb) await this.storage.putObject(file.bucket, `${key}.thumb.webp`, thumb, 'image/webp');
      await tx
        .update(files)
        .set({
          scanStatus: 'clean',
          sha256: sha256(inspection.content),
          sizeBytes: inspection.content.length,
          objectKey: key,
        })
        .where(eq(files.id, file.id));
      return { bucket: file.bucket, key: file.objectKey };
    });
    // Après le COMMIT seulement : en cas d'échec avant, le job est repris sur l'objet encore en quarantaine. Un échec
    // ici laisse un orphelin pour la tâche de ménage.
    if (quarantine) await this.storage.deleteObject(quarantine.bucket, quarantine.key);
  }
}
