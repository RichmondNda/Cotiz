import { Injectable } from '@nestjs/common';
import type { AssociationInvoice, ListQuery } from '@cotiz/contracts';
import type { z } from 'zod';
import { contextAssociationId } from '../../tenancy/tenancy.public.js';
import { associationInvoiceOf, invoicePage, ofAssociation } from './invoice-views.js';

/**
 * bl.inv : factures d'abonnement de l'association (écran Abonnement), les plus récentes d'abord, dans son contexte
 * (RLS tenant_isolation + filtre explicite). Le PDF se lit par `as.file` (`pdfFileId`).
 */
@Injectable()
export class ListAssociationInvoicesUseCase {
  async execute(
    aid: string,
    query: z.infer<typeof ListQuery>,
  ): Promise<{ items: z.infer<typeof AssociationInvoice>[]; nextCursor: string | null; total: number }> {
    const associationId = contextAssociationId(aid);
    const page = await invoicePage(ofAssociation(associationId), query);
    return { items: page.rows.map(associationInvoiceOf), nextCursor: page.nextCursor, total: page.total };
  }
}
