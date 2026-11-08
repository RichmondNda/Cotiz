import { Injectable } from '@nestjs/common';
import type { PersonRef, ProjectContract } from '@cotiz/contracts';
import { contractSignatures, enrollments } from '@cotiz/db';
import { and, asc, count, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { SubscriberAccounts } from '../../identity/identity.public.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import type { ContractRecord } from './contract-records.js';

/**
 * Contrat tel que l'affiche l'éditeur (ct.get), lu sous la RLS de l'association :
 * - signées : contre-signatures du contrat ; total : signées + inscriptions en attente de signature (une inscription
 *   retirée, ou née active avant le contrat, n'est pas comptée) ;
 * - à signer : inscriptions `pending_signature`, la plus ancienne d'abord ;
 * - `pdfFileId` : aucun PDF au niveau du contrat dans schema.sql (le PDF signé est celui de chaque signature) → `null`.
 */
@Injectable()
export class ContractViews {
  constructor(private readonly accounts: SubscriberAccounts) {}

  async toProjectContract(row: ContractRecord): Promise<z.infer<typeof ProjectContract>> {
    const tx = currentTx();
    const [signed] = await tx
      .select({ n: count() })
      .from(contractSignatures)
      .where(eq(contractSignatures.contractId, row.id));
    const pending = await tx
      .select({ id: enrollments.id, userId: enrollments.userId, joinedAt: enrollments.joinedAt })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.associationId, row.associationId),
          eq(enrollments.projectId, row.projectId),
          eq(enrollments.status, 'pending_signature'),
        ),
      )
      .orderBy(asc(enrollments.joinedAt), asc(enrollments.id));
    const people = await this.accounts.contactsOf([
      ...pending.map((e) => e.userId),
      ...(row.associationSignedBy ? [row.associationSignedBy] : []),
    ]);
    const ref = (id: string): PersonRef => {
      const person = people.get(id);
      if (!person) throw new Error('ct.get : personne introuvable');
      return { id: person.id, firstName: person.firstName, lastName: person.lastName };
    };
    const signedCount = signed?.n ?? 0;
    return {
      id: row.id,
      projectId: row.projectId,
      bodyTemplate: row.bodyTemplate,
      templateSha256: row.templateSha256,
      signer: { name: row.associationSignerName, title: row.associationSignerTitle },
      associationSignedAt: row.associationSignedAt?.toISOString() ?? null,
      associationSignedBy: row.associationSignedBy ? ref(row.associationSignedBy) : null,
      lockedAt: row.lockedAt?.toISOString() ?? null,
      signatures: { signed: signedCount, total: signedCount + pending.length },
      unsigned: pending.map((e) => ({
        enrollmentId: e.id,
        member: ref(e.userId),
        enrolledAt: e.joinedAt.toISOString(),
      })),
      pdfFileId: null,
      version: row.version,
    };
  }
}
