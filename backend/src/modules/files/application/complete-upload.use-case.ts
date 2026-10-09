import { Injectable } from '@nestjs/common';
import type { StoredFile } from '@cotiz/contracts';
import type { z } from 'zod';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { StorageService } from '../../../shared/storage/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { findFile } from './find-file.js';
import { toStoredFile } from './stored-file.js';

/**
 * fl.upload › complete : le déposant confirme le dépôt. L'objet doit être en quarantaine avec la taille et le type
 * déclarés ; l'événement file.uploaded déclenche l'analyse du worker (étape 4). Un fichier déjà analysé est renvoyé
 * tel quel, sans nouvel événement.
 */
@Injectable()
export class CompleteUploadUseCase {
  constructor(
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(id: string): Promise<z.infer<typeof StoredFile>> {
    const actor = requireActor();
    const file = await findFile(actor, id, { forUpdate: true });
    // Seul le déposant confirme son dépôt ; pour les autres, le fichier n'existe pas.
    if (file?.ownerUserId !== actor.userId) throw new DomainProblem('not_found');
    if (file.scanStatus !== 'pending') return toStoredFile(file);

    const object = await this.storage.head(file.bucket, file.objectKey);
    if (object?.size !== file.sizeBytes || object.contentType !== file.mimeType) {
      throw new DomainProblem('invalid_state', { detail: 'Le fichier n’a pas été déposé.' });
    }
    await this.outbox.publish(currentTx(), {
      type: 'file.uploaded',
      associationId: file.associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'file', id: file.id },
      payload: { fileId: file.id, purpose: file.purpose },
    });
    return toStoredFile(file);
  }
}
