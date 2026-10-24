import { Injectable } from '@nestjs/common';
import { type UploadRequest, type UploadTicket, uploadRejection } from '@cotiz/contracts';
import { files } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import type { z } from 'zod';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { BUCKETS, quarantineKey, StorageService } from '../../../shared/storage/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { UPLOAD_SPACE } from '../domain/upload-policy.js';

/**
 * fl.upload › create : vérifie la déclaration (taille, type, usage permis dans cet espace), enregistre le fichier
 * `pending` et renvoie une URL de dépôt de 5 min sous `quarantine/`. Le contenu réel est revérifié par le worker.
 */
@Injectable()
export class RequestUploadUseCase {
  constructor(private readonly storage: StorageService) {}

  async execute(input: z.infer<typeof UploadRequest>): Promise<z.infer<typeof UploadTicket>> {
    const actor = requireActor();
    const rejection = uploadRejection(input);
    if (rejection) throw new DomainProblem(rejection);
    if (UPLOAD_SPACE[input.purpose] !== actor.space) throw new DomainProblem('forbidden');
    // Jeton association sans association (lot 1.2, choix Q1) : fl.upload ne dit pas à quelle association rattacher le
    // fichier. Refus explicite plutôt qu'une ligne refusée par la RLS (500) : le gestionnaire dépose par as.upload.
    if (actor.space === 'association' && actor.associationId === undefined) throw new DomainProblem('forbidden');

    const id = newId();
    const bucket = BUCKETS[input.purpose];
    const key = quarantineKey(id);
    await currentTx()
      .insert(files)
      .values({
        id,
        // Gestionnaire : l'association du contexte. Souscripteur : rattachée à l'association à la déclaration (3.3).
        associationId: actor.space === 'association' ? actor.associationId : null,
        ownerUserId: actor.userId,
        purpose: input.purpose,
        bucket,
        objectKey: key,
        originalName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      });
    const { url, expiresAt } = await this.storage.presignUpload({
      bucket,
      key,
      contentType: input.mimeType,
      contentLength: input.sizeBytes,
    });
    return {
      fileId: id,
      uploadUrl: url,
      method: 'PUT',
      headers: { 'content-type': input.mimeType },
      expiresAt: expiresAt.toISOString(),
    };
  }
}
