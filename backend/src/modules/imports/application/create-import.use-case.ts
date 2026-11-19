import { Injectable } from '@nestjs/common';
import type { ImportJob } from '@cotiz/contracts';
import { importJobs } from '@cotiz/db';
import type { z } from 'zod';
import { assertPlanFeature, QuotaService } from '../../billing/billing.public.js';
import { importSourceOf } from '../../files/files.public.js';
import { contextAssociationId } from '../../members/members.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { toImportJob } from './import-records.js';

/**
 * im.flow : import créé depuis un fichier déposé (`fl.upload`, usage `import_source`), analysé ensuite par le worker
 * (`import.created`). Fonctionnalité `imports` du plan (403 `feature_disabled`) ; projet de l'association, fichier de
 * l'association (sinon 404) ; autre usage ou fichier refusé par l'analyse : 422 `file_type_not_allowed` ; plus aucune
 * place de souscripteur dans le plan : 409 `quota_exceeded` (recontrôlé à l'envoi pour toutes les lignes). Un fichier
 * encore en cours d'analyse est accepté : le worker attend son verdict.
 */
@Injectable()
export class CreateImportUseCase {
  constructor(
    private readonly quotas: QuotaService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(aid: string, projectId: string, input: { fileId: string }): Promise<z.infer<typeof ImportJob>> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    await assertPlanFeature(associationId, 'imports');
    if (!(await projectOf(associationId, projectId))) throw new DomainProblem('not_found');
    const file = await importSourceOf(input.fileId);
    if (!file) throw new DomainProblem('not_found');
    if (file.purpose !== 'import_source' || file.scanStatus === 'infected') {
      throw new DomainProblem('file_type_not_allowed');
    }
    await this.quotas.assert(associationId, 'subscribers');

    const [job] = await currentTx()
      .insert(importJobs)
      .values({
        associationId,
        projectId,
        sourceFileId: input.fileId,
        columnMapping: [],
        // Canaux d'invitation : aucun tant que le groupe 6 n'est pas activé (ui-deviations.md, mg-import).
        inviteChannels: [],
        createdBy: actor.userId,
      })
      .returning();
    if (!job) throw new Error('import non créé');
    await this.outbox.publish(currentTx(), {
      type: 'import.created',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'import', id: job.id },
      payload: { importId: job.id },
    });
    return toImportJob(job);
  }
}
