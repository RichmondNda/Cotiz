import { Injectable } from '@nestjs/common';
import type { SubscriberContract } from '@cotiz/contracts';
import { contracts, contractSignatures, files } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { UserProfiles } from '../../identity/identity.public.js';
import type { SubscriberEnrollment } from '../../members/members.public.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { type ContractRecord } from './contract-records.js';
import { renderedContractOf } from './contract-rendering.js';

/** « J'ai lu le contrat et je l'accepte… » : texte exact enregistré avec chaque signature (preuve). */
export const CONSENT_TEXT =
  'J’ai lu le contrat et je l’accepte. Je reconnais que ma signature électronique a la même valeur qu’une signature ' +
  'manuscrite.';

export type SignatureRecord = typeof contractSignatures.$inferSelect;

/**
 * Contrat personnalisé d'une inscription de la personne connectée (espace subscriber) : contrat du projet (RLS
 * `subscriber_enrolled_read`, filtré aussi par projet et association de l'inscription), texte rendu par
 * `renderContract()` de @cotiz/domain avec ses valeurs (conditions figées au verrouillage, domain-rules § 9 : même
 * texte, même empreinte), engagement par generateSchedule() depuis sa date d'entrée, signature de la personne.
 */
@Injectable()
export class SubscriberContracts {
  constructor(private readonly profiles: UserProfiles) {}

  async contractOf(entry: SubscriberEnrollment): Promise<ContractRecord | null> {
    const [row] = await currentTx()
      .select()
      .from(contracts)
      .where(and(eq(contracts.associationId, entry.association.id), eq(contracts.projectId, entry.project.id)))
      .limit(1);
    return row ?? null;
  }

  /** Signature de cette inscription par la personne (RLS `subscriber_self_read`, filtrée aussi par personne). */
  async signatureOf(entry: SubscriberEnrollment): Promise<SignatureRecord | null> {
    const [row] = await currentTx()
      .select()
      .from(contractSignatures)
      .where(and(eq(contractSignatures.enrollmentId, entry.row.id), eq(contractSignatures.userId, entry.row.userId)))
      .limit(1);
    return row ?? null;
  }

  async view(
    entry: SubscriberEnrollment,
    contract: ContractRecord,
    signature: SignatureRecord | null,
  ): Promise<z.infer<typeof SubscriberContract>> {
    const { project, association } = entry;
    const profile = await this.profiles.read(entry.row.userId);
    if (!profile) throw new Error('me.contract : compte introuvable');
    const { body, renderedSha256, terms, schedule, total } = renderedContractOf({
      associationName: association.name,
      project,
      startsFrom: entry.row.startsFrom,
      bodyTemplate: contract.bodyTemplate,
      subscriber: { firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone },
    });
    return {
      project: { id: project.id, name: project.name },
      association: { id: association.id, name: association.name, logoFileId: association.logoFileId },
      commitment: {
        entryFee: terms.entryFee,
        installmentAmount: terms.installmentAmount,
        frequency: terms.frequency,
        periodicCount: schedule ? schedule.filter((l) => l.kind === 'periodic').length : null,
        total,
      },
      body,
      renderedSha256,
      associationSigner: {
        name: contract.associationSignerName,
        title: contract.associationSignerTitle,
        signedAt: contract.associationSignedAt?.toISOString() ?? null,
      },
      consentText: CONSENT_TEXT,
      signedAt: signature?.signedAt.toISOString() ?? null,
      pdfFileId: signature ? await this.readyPdfOf(signature, entry.row.userId) : null,
    };
  }

  /** PDF signé téléchargeable : produit par le worker documents (`clean`) ; avant, `null`. */
  async readyPdfOf(signature: SignatureRecord, userId: string): Promise<string | null> {
    const fileId = signature.pdfFileId;
    const [row] = await currentTx()
      .select({ scanStatus: files.scanStatus })
      .from(files)
      // La RLS (`subscriber_contract_pdf_read`) filtre déjà ; le code aussi (défense en profondeur).
      .where(and(eq(files.id, fileId), eq(files.ownerUserId, userId), eq(files.purpose, 'contract_pdf')))
      .limit(1);
    return row?.scanStatus === 'clean' ? fileId : null;
  }
}
