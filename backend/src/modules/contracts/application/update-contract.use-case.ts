import { Injectable } from '@nestjs/common';
import { ENDPOINTS, type ProjectContract } from '@cotiz/contracts';
import { contracts, updateWithVersion } from '@cotiz/db';
import type { z } from 'zod';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, expectedVersion } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import {
  assertCanManageContract,
  assertContractsFeature,
  contextAssociationId,
  contractOfProject,
  sha256Of,
} from './contract-records.js';
import { ContractViews } from './contract-views.js';

type Input = z.infer<(typeof ENDPOINTS)['ct.get']['operations']['update']['request']['body']>;

/**
 * ct.get (PUT) : modèle et signataire remplacés sous verrou optimiste (`If-Match`, 412), empreinte du modèle
 * recalculée. Contrat verrouillé : 409 `contract_locked` (aussi refusé par le déclencheur contracts_locked). Pas de
 * contrat : 404 (il se crée avec le projet, pr.create). `projects.manage` exigé ; modification auditée.
 */
@Injectable()
export class UpdateContractUseCase {
  constructor(private readonly views: ContractViews) {}

  @Audited('contract.update')
  async execute(aid: string, projectId: string, input: Input): Promise<z.infer<typeof ProjectContract>> {
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
        bodyTemplate: input.bodyTemplate,
        templateSha256: sha256Of(input.bodyTemplate),
        associationSignerName: input.signerName,
        associationSignerTitle: input.signerTitle,
      },
    );
    if (!updated) throw new DomainProblem('not_found');
    recordAudit({
      entityType: 'contract',
      entityId: current.id,
      associationId,
      before: {
        bodyTemplate: current.bodyTemplate,
        signerName: current.associationSignerName,
        signerTitle: current.associationSignerTitle,
      },
      after: { bodyTemplate: input.bodyTemplate, signerName: input.signerName, signerTitle: input.signerTitle },
    });
    return this.views.toProjectContract(updated);
  }
}
