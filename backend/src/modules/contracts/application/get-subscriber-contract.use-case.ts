import { Injectable } from '@nestjs/common';
import type { SubscriberContract } from '@cotiz/contracts';
import type { z } from 'zod';
import { subscriberEnrollmentsOf } from '../../members/members.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { SubscriberContracts } from './subscriber-contracts.js';

/**
 * me.contract (espace subscriber) : contrat personnalisé de l'inscription de la personne au projet, et son empreinte à
 * renvoyer à la signature. Pas inscrite (ou inscription retirée), projet sans contrat, contrat encore en brouillon
 * (non verrouillé, RLS de la migration 0019) : 404.
 */
@Injectable()
export class GetSubscriberContractUseCase {
  constructor(private readonly contracts: SubscriberContracts) {}

  async execute(projectId: string): Promise<z.infer<typeof SubscriberContract>> {
    const [entry] = await subscriberEnrollmentsOf({ projectId: projectId.toLowerCase() });
    const contract = entry ? await this.contracts.contractOf(entry) : null;
    if (!entry || !contract) throw new DomainProblem('not_found');
    return this.contracts.view(entry, contract, await this.contracts.signatureOf(entry));
  }
}
