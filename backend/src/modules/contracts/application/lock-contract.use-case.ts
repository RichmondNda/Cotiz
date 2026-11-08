import { Injectable } from '@nestjs/common';
import type { ProjectContract } from '@cotiz/contracts';
import { contracts, updateWithVersion } from '@cotiz/db';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, expectedVersion, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import {
  assertCanManageContract,
  assertContractsFeature,
  contextAssociationId,
  contractOfProject,
  publishContractLocked,
  sha256Of,
} from './contract-records.js';
import { ContractViews } from './contract-views.js';

/**
 * ct.get (lock) : signature de l'association par la personne connectée et verrouillage, sous verrou optimiste
 * (`If-Match`, 412) ; empreinte du modèle verrouillé. Déjà verrouillé : 409 `contract_locked`. `projects.manage`
 * exigé ; `contract.locked` (souscripteurs en attente avertis), audité.
 */
@Injectable()
export class LockContractUseCase {
  constructor(
    private readonly views: ContractViews,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('contract.lock')
  async execute(aid: string, projectId: string): Promise<z.infer<typeof ProjectContract>> {
    const actor = requireActor();
    const version = expectedVersion();
    const associationId = contextAssociationId(aid);
    assertCanManageContract();
    await assertContractsFeature(associationId);
    const current = await contractOfProject(associationId, projectId, { lock: true });
    if (!current) throw new DomainProblem('not_found');
    if (current.lockedAt) throw new DomainProblem('contract_locked');

    const updated = await updateWithVersion(
      currentTx(),
      contracts,
      { id: current.id, version },
      {
        templateSha256: sha256Of(current.bodyTemplate),
        associationSignedBy: actor.userId,
        associationSignedAt: sql`now()`,
        lockedAt: sql`now()`,
      },
    );
    if (!updated) throw new DomainProblem('not_found');
    await publishContractLocked(this.outbox, updated, actor.userId);
    recordAudit({
      entityType: 'contract',
      entityId: current.id,
      associationId,
      before: { lockedAt: null },
      after: { lockedAt: updated.lockedAt?.toISOString() ?? null, templateSha256: updated.templateSha256 },
    });
    return this.views.toProjectContract(updated);
  }
}
