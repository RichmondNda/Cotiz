import { Injectable } from '@nestjs/common';
import type { SubscriberContract } from '@cotiz/contracts';
import type { z } from 'zod';
import { subscriberEnrollmentsOf } from '../../members/members.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { SubscriberContracts } from './subscriber-contracts.js';

/**
 * me.contract (espace subscriber) : contrat personnalisé de l'inscription de la personne au projet, et son empreinte à
 * renvoyer à la signature. Pas inscrite, projet sans contrat, contrat encore en brouillon (non verrouillé, RLS de la
 * migration 0019), inscription retirée sans signature : 404. Retirée et signée : le contrat signé, en lecture seule
 * (décision du 2026-11-10 ; me.sign refuse toute inscription qui n'attend pas sa signature).
 */
@Injectable()
export class GetSubscriberContractUseCase {
  constructor(private readonly contracts: SubscriberContracts) {}

  async execute(projectId: string): Promise<z.infer<typeof SubscriberContract>> {
    const [entry] = await subscriberEnrollmentsOf({ projectId: projectId.toLowerCase(), includeWithdrawn: true });
    const contract = entry ? await this.contracts.contractOf(entry) : null;
    if (!entry || !contract) throw new DomainProblem('not_found');
    const signature = await this.contracts.signatureOf(entry);
    if (entry.row.status === 'withdrawn' && !signature) throw new DomainProblem('not_found');
    return this.contracts.view(entry, contract, signature);
  }
}
