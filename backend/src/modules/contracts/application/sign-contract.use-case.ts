import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import type { SubscriberContract } from '@cotiz/contracts';
import { contractSignatures, enrollments, files, projects } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { subscriberEnrollmentsOf } from '../../members/members.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentRequestInfo } from '../../../shared/request-info/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { CONSENT_TEXT, SubscriberContracts } from './subscriber-contracts.js';

/** Projets clos : plus rien à signer (comme me.declare). */
const CLOSED_PROJECTS = new Set(['completed', 'archived']);
/** Bucket des documents légaux (architecture/05) : PDF signés, jamais supprimés. */
const LEGAL_BUCKET = 'cotiz-legal';

/**
 * me.sign (espace subscriber, Idempotency-Key, audité), une transaction :
 * 1. inscription de la personne au projet (sinon 404), contrat **verrouillé** du projet (signé par l'association ;
 *    sinon 404 : rien à signer) ; inscription relue FOR UPDATE (politique `subscriber_sign_update`) : deux signatures
 *    simultanées se suivent, la seconde voit la première (`already_signed`) ;
 * 2. déjà signée : 409 `already_signed` ; inscription qui n'attend pas de signature : 404 ;
 * 3. texte rendu comparé à l'empreinte affichée : 409 `contract_changed` ;
 * 4. ligne `files` du PDF signé (`pending`, produite par le worker à l'étape 4 ; clé calculée ici, imposée par la
 *    politique `subscriber_contract_pdf_create`), puis contre-signature avec ses éléments de preuve (empreinte, texte de
 *    consentement exact, instant, IP, navigateur ; `subscriber_sign` : inscription encore en attente), puis inscription
 *    `active` (`guard_enrollment_update`) ;
 * 5. `contract.signed` : l'échéancier est généré par le consommateur système (décision 20), le PDF à l'étape 4.
 */
@Injectable()
export class SignContractUseCase {
  constructor(
    private readonly contracts: SubscriberContracts,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('contract.sign')
  async execute(projectId: string, input: { renderedSha256: string }): Promise<z.infer<typeof SubscriberContract>> {
    const actor = requireActor();
    const [entry] = await subscriberEnrollmentsOf({ projectId: projectId.toLowerCase() });
    const contract = entry ? await this.contracts.contractOf(entry) : null;
    if (!entry || !contract?.lockedAt) throw new DomainProblem('not_found');
    const associationId = entry.association.id;

    const tx = currentTx();
    const [locked] = await tx
      .select({ status: enrollments.status })
      .from(enrollments)
      .where(and(eq(enrollments.id, entry.row.id), eq(enrollments.userId, actor.userId)))
      .for('update');
    if (!locked) throw new DomainProblem('not_found');
    if (await this.contracts.signatureOf(entry)) throw new DomainProblem('already_signed');
    if (locked.status !== 'pending_signature') throw new DomainProblem('not_found');
    // Projet clos (terminé, archivé) : rien à signer. Relu après le verrou de l'inscription : une clôture commitée
    // entre-temps est vue (READ COMMITTED) ; le souscripteur ne peut pas verrouiller le projet (aucune politique UPDATE).
    const [project] = await tx
      .select({ status: projects.status })
      .from(projects)
      .where(and(eq(projects.id, entry.row.projectId), eq(projects.associationId, associationId)));
    if (!project || CLOSED_PROJECTS.has(project.status)) throw new DomainProblem('not_found');

    const shown = await this.contracts.view(entry, contract, null);
    if (shown.renderedSha256 !== input.renderedSha256.toLowerCase()) throw new DomainProblem('contract_changed');

    const fileId = newId();
    await tx.insert(files).values({
      id: fileId,
      associationId,
      ownerUserId: actor.userId,
      purpose: 'contract_pdf',
      bucket: LEGAL_BUCKET,
      objectKey: `${associationId}/contract_pdf/${fileId}.pdf`,
      originalName: 'contrat-signe.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 0,
    });
    const request = currentRequestInfo();
    const [signature] = await tx
      .insert(contractSignatures)
      .values({
        id: newId(),
        associationId,
        contractId: contract.id,
        enrollmentId: entry.row.id,
        userId: actor.userId,
        renderedSha256: shown.renderedSha256,
        consentText: CONSENT_TEXT,
        signedAt: sql`now()`,
        ip: request?.ip && isIP(request.ip) !== 0 ? request.ip : null,
        userAgent: request?.userAgent ?? null,
        pdfFileId: fileId,
      })
      .onConflictDoNothing({ target: contractSignatures.enrollmentId })
      .returning();
    if (!signature) throw new DomainProblem('already_signed');
    const [activated] = await tx
      .update(enrollments)
      .set({ status: 'active', activatedAt: sql`now()` })
      .where(and(eq(enrollments.id, entry.row.id), eq(enrollments.userId, actor.userId)))
      .returning({ id: enrollments.id });
    // Signature sans inscription activée : pas d'échéancier au consommateur ; tout est annulé.
    if (!activated) throw new Error('me.sign : inscription non activée');

    await this.outbox.publish(tx, {
      type: 'contract.signed',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'contract_signature', id: signature.id },
      payload: { signatureId: signature.id, enrollmentId: entry.row.id, userId: actor.userId },
    });
    recordAudit({
      entityType: 'contract_signature',
      entityId: signature.id,
      associationId,
      after: {
        contractId: contract.id,
        enrollmentId: entry.row.id,
        projectId: entry.project.id,
        renderedSha256: signature.renderedSha256,
        pdfFileId: fileId,
      },
    });
    return { ...shown, signedAt: signature.signedAt.toISOString() };
  }
}
