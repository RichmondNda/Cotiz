import { Injectable } from '@nestjs/common';
import { ENDPOINTS } from '@cotiz/contracts';
import type { z } from 'zod';
import { subscriberEnrollmentsOf } from '../../members/members.public.js';
import { SubscriberContracts } from './subscriber-contracts.js';

type Item = z.infer<(typeof ENDPOINTS)['me.contracts']['operations']['list']['response']['body']>['items'][number];

/**
 * me.contracts (espace subscriber) : contrats des inscriptions de la personne (associations où elle est souscriptrice
 * active : subscriberEnrollmentsOf), à signer en tête. Signé : date et PDF une fois produit ; inscription retirée depuis :
 * contrat signé gardé, `enrollmentWithdrawn` (décision du 2026-11-10). Inscription sans contrat, contrat encore en
 * brouillon (RLS de la migration 0019), active ou retirée sans signature : absente, rien à signer.
 */
@Injectable()
export class ListSubscriberContractsUseCase {
  constructor(private readonly contracts: SubscriberContracts) {}

  async execute(): Promise<{ items: Item[] }> {
    const toSign: Item[] = [];
    const signed: Item[] = [];
    // Une transaction = une connexion : lectures l'une après l'autre.
    for (const entry of await subscriberEnrollmentsOf({ includeWithdrawn: true })) {
      const contract = await this.contracts.contractOf(entry);
      if (!contract) continue;
      const signature = await this.contracts.signatureOf(entry);
      const refs = {
        project: { id: entry.project.id, name: entry.project.name },
        association: {
          id: entry.association.id,
          name: entry.association.name,
          logoFileId: entry.association.logoFileId,
          suspended: entry.association.suspended,
        },
      };
      if (signature) {
        signed.push({
          ...refs,
          status: 'signed',
          signedAt: signature.signedAt.toISOString(),
          pdfFileId: await this.contracts.readyPdfOf(signature, entry.row.userId),
          enrollmentWithdrawn: entry.row.status === 'withdrawn',
        });
      } else if (entry.row.status === 'pending_signature') {
        toSign.push({ ...refs, status: 'to_sign', signedAt: null, pdfFileId: null, enrollmentWithdrawn: false });
      }
    }
    return { items: [...toSign, ...signed] };
  }
}
