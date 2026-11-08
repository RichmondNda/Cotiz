import { Injectable } from '@nestjs/common';
import type { SubscriberContract } from '@cotiz/contracts';
import { contracts, contractSignatures, files } from '@cotiz/db';
import { contractValues, Money, renderContract } from '@cotiz/domain';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { UserProfiles } from '../../identity/identity.public.js';
import type { SubscriberEnrollment } from '../../members/members.public.js';
import { enrollmentScheduleOf, termsOf } from '../../projects/projects.public.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { type ContractRecord, sha256Of } from './contract-records.js';

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
    const terms = termsOf(project);
    const currency = terms.installmentAmount.currency;
    const fixed = project.scheduleType === 'fixed';
    const lines = fixed ? enrollmentScheduleOf(project, entry.row.startsFrom) : null;
    const schedule = Array.isArray(lines) ? lines : null;
    const body = renderContract(
      contract.bodyTemplate,
      contractValues({
        associationName: association.name,
        projectName: project.name,
        currency,
        entryFee: terms.entryFee?.amount ?? null,
        installmentAmount: terms.installmentAmount.amount,
        frequency: terms.frequency,
        dueDay: terms.dueDay,
        startDate: entry.row.startsFrom,
        schedule,
        subscriber: { firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone },
      }),
    );
    const total = schedule
      ? Money.sum(
          schedule.map((l) => Money.of(l.amountDue, currency)),
          currency,
        )
      : null;
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
      renderedSha256: sha256Of(body),
      associationSigner: {
        name: contract.associationSignerName,
        title: contract.associationSignerTitle,
        signedAt: contract.associationSignedAt?.toISOString() ?? null,
      },
      consentText: CONSENT_TEXT,
      signedAt: signature?.signedAt.toISOString() ?? null,
      pdfFileId: signature ? await this.readyPdf(signature.pdfFileId, entry.row.userId) : null,
    };
  }

  /** PDF signé téléchargeable : produit et analysé (`clean`, étape 4) ; avant, `null`. */
  private async readyPdf(fileId: string, userId: string): Promise<string | null> {
    const [row] = await currentTx()
      .select({ scanStatus: files.scanStatus })
      .from(files)
      // La RLS (`subscriber_contract_pdf_read`) filtre déjà ; le code aussi (défense en profondeur).
      .where(and(eq(files.id, fileId), eq(files.ownerUserId, userId), eq(files.purpose, 'contract_pdf')))
      .limit(1);
    return row?.scanStatus === 'clean' ? fileId : null;
  }
}
