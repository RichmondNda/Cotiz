import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable } from '@nestjs/common';
import type { StoredFile } from '@cotiz/contracts';
import type { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { StorageService } from '../../../shared/storage/index.js';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import { UPLOAD_SPACE } from '../domain/upload-policy.js';
import { findFile } from './find-file.js';
import { toStoredFile } from './stored-file.js';

type Stored = z.infer<typeof StoredFile>;

/** Intervalle d'interrogation du résultat de l'analyse. */
const POLL_MS = 100;

/**
 * fl.upload › complete : le déposant confirme le dépôt. L'objet doit être en quarantaine avec la taille et le type
 * déclarés ; l'événement file.uploaded déclenche l'analyse du worker. Après le COMMIT (le worker ne voit l'événement
 * qu'alors), la réponse attend le résultat au plus FILE_SCAN_WAIT_MS : `clean`, 422 `file_not_clean`, ou `pending`.
 * Un fichier déjà analysé, ou en cours d'analyse, ne publie pas de nouvel événement.
 */
@Injectable()
export class CompleteUploadUseCase {
  constructor(
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async execute(id: string): Promise<Stored | AfterCommit<Stored>> {
    const actor = requireActor();
    const file = await findFile(actor, id);
    // Seul le déposant confirme son dépôt, et seulement un usage qu'on dépose depuis son espace (pas un PDF produit par
    // le serveur, lisible par le souscripteur depuis le lot 4.1) ; pour les autres, le fichier n'existe pas.
    if (file?.ownerUserId !== actor.userId || UPLOAD_SPACE[file.purpose] !== actor.space) {
      throw new DomainProblem('not_found');
    }
    if (file.scanStatus === 'infected') throw new DomainProblem('file_not_clean');
    if (file.scanStatus === 'clean') return toStoredFile(file);

    // Verrouillée par le worker : l'analyse est en cours. Ni attente du verrou (l'analyse peut durer), ni nouvel
    // événement : seulement l'attente du résultat.
    const unlocked = await findFile(actor, id, { lock: 'skip-locked' });
    if (unlocked?.scanStatus === 'pending') {
      const object = await this.storage.head(unlocked.bucket, unlocked.objectKey);
      if (object?.size !== unlocked.sizeBytes || object.contentType !== unlocked.mimeType) {
        throw new DomainProblem('invalid_state', { detail: 'Le fichier n’a pas été déposé.' });
      }
      await this.outbox.publish(currentTx(), {
        type: 'file.uploaded',
        associationId: unlocked.associationId,
        actorUserId: actor.userId,
        aggregate: { type: 'file', id: unlocked.id },
        payload: { fileId: unlocked.id, purpose: unlocked.purpose },
      });
    }

    const deadline = Date.now() + this.config.FILE_SCAN_WAIT_MS;
    return afterCommit(async (inContext) => {
      for (;;) {
        const current = await inContext(() => findFile(actor, id));
        if (!current) throw new DomainProblem('not_found');
        if (current.scanStatus === 'infected') throw new DomainProblem('file_not_clean');
        if (current.scanStatus === 'clean' || Date.now() >= deadline) return toStoredFile(current);
        await sleep(POLL_MS);
      }
    });
  }
}
