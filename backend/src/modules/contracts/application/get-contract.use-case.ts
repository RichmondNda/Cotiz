import { Injectable } from '@nestjs/common';
import type { ProjectContract } from '@cotiz/contracts';
import type { z } from 'zod';
import { DomainProblem } from '../../../shared/http/index.js';
import { assertContractsFeature, contextAssociationId, contractOfProject } from './contract-records.js';
import { ContractViews } from './contract-views.js';

/**
 * ct.get (lecture) : contrat du projet et état des signatures ; fonctionnalité `contracts` du plan. Projet sans
 * contrat, inconnu ou d'une autre association : 404 (RLS et filtre par association).
 */
@Injectable()
export class GetContractUseCase {
  constructor(private readonly views: ContractViews) {}

  async execute(aid: string, projectId: string): Promise<z.infer<typeof ProjectContract>> {
    const associationId = contextAssociationId(aid);
    await assertContractsFeature(associationId);
    const row = await contractOfProject(associationId, projectId);
    if (!row) throw new DomainProblem('not_found');
    return this.views.toProjectContract(row);
  }
}
