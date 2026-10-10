import { Injectable } from '@nestjs/common';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { StorageService } from '../../../shared/storage/index.js';
import { findFile } from './find-file.js';

/**
 * fl.get : contrôle d'accès (RLS : association ou déposant), puis URL de lecture signée de 5 min. Un fichier en
 * attente d'analyse ou infecté n'est jamais servi (404). Chaque consultation est auditée (endpoints.yaml).
 */
@Injectable()
export class GetFileUseCase {
  constructor(private readonly storage: StorageService) {}

  @Audited('file.read')
  async execute(id: string): Promise<string> {
    const actor = requireActor();
    const file = await findFile(actor, id);
    if (file?.scanStatus !== 'clean') throw new DomainProblem('not_found');
    recordAudit({ entityType: 'file', entityId: file.id, associationId: file.associationId });
    return this.storage.presignDownload({
      bucket: file.bucket,
      key: file.objectKey,
      fileName: file.originalName,
      contentType: file.mimeType,
    });
  }
}
