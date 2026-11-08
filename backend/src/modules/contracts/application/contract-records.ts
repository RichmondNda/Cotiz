import { createHash } from 'node:crypto';
import type { ProjectContractInput } from '@cotiz/contracts';
import { contracts, contractSignatures, enrollments } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { holdsPermission } from '../../access/access.public.js';
import { assertPlanFeature } from '../../billing/billing.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import type { OutboxService } from '../../../shared/outbox/index.js';
import { currentRequestInfo } from '../../../shared/request-info/index.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

export type ContractRecord = typeof contracts.$inferSelect;

/** Empreinte SHA-256 (hexadécimal) d'un texte : modèle de contrat, contrat rendu. */
export function sha256Of(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Identifiant de l'association du contexte, égal à celui de l'URL ; sinon erreur de programmation. */
export function contextAssociationId(aid: string): string {
  const context = currentContext();
  const id = aid.toLowerCase();
  if (context?.space !== 'association' || context.associationId !== id) {
    throw new Error('contracts : contexte de cette association attendu');
  }
  return id;
}

/** Contrats compris dans le plan de l'association (features.yaml, `planGated`), sinon 403 `feature_disabled`. */
export function assertContractsFeature(associationId: string): Promise<void> {
  return assertPlanFeature(associationId, 'contracts');
}

/**
 * Modifier ou verrouiller un contrat : `projects.manage` (owner, manager) en plus de `association.read` du contrat
 * (ct.get), choix de l'utilisateur du lot 4.1 ; un viewer lit seulement (403 `forbidden`).
 */
export function assertCanManageContract(): void {
  if (!holdsPermission('projects.manage', { role: currentRequestInfo()?.actorRole ?? null })) {
    throw new DomainProblem('forbidden');
  }
}

/** Contrat d'un projet de l'association (RLS) ; `lock` : FOR UPDATE (modification, verrouillage). */
export async function contractOfProject(
  associationId: string,
  projectId: string,
  options: { lock?: boolean } = {},
): Promise<ContractRecord | null> {
  const query = currentTx()
    .select()
    .from(contracts)
    .where(and(eq(contracts.associationId, associationId), eq(contracts.projectId, projectId)))
    .limit(1);
  const [row] = options.lock ? await query.for('update') : await query;
  return row ?? null;
}

/**
 * Le projet exige-t-il un contrat (une ligne `contracts`, choix du lot 4.1) ? Pour en.create : une inscription y naît
 * `pending_signature`, sans échéance (décision 20). Lu FOR SHARE : un contrat ne disparaît pas pendant l'inscription.
 */
export async function projectRequiresContract(associationId: string, projectId: string): Promise<boolean> {
  const [row] = await currentTx()
    .select({ id: contracts.id })
    .from(contracts)
    .where(and(eq(contracts.associationId, associationId), eq(contracts.projectId, projectId)))
    .limit(1)
    .for('share');
  return row !== undefined;
}

/** `contract.locked` : association signataire, contrat verrouillé (notifications : souscripteurs en attente). */
export async function publishContractLocked(
  outbox: OutboxService,
  contract: { id: string; associationId: string; projectId: string },
  actorUserId: string,
): Promise<void> {
  await outbox.publish(currentTx(), {
    type: 'contract.locked',
    associationId: contract.associationId,
    actorUserId,
    aggregate: { type: 'contract', id: contract.id },
    payload: { contractId: contract.id, projectId: contract.projectId },
  });
}

/**
 * Contrat saisi à la création du projet (pr.create, étape 5 de l'assistant), dans sa transaction ; « je signe »
 * (`signNow`) : signé par la personne connectée et verrouillé aussitôt, `contract.locked`. L'appelant (create-project)
 * vérifie la fonctionnalité du plan et l'audite avec le projet.
 */
export async function createProjectContract(
  outbox: OutboxService,
  input: {
    associationId: string;
    projectId: string;
    actorUserId: string;
    contract: z.infer<typeof ProjectContractInput>;
  },
): Promise<ContractRecord> {
  const { associationId, projectId, actorUserId, contract } = input;
  const signed = contract.signNow
    ? { associationSignedBy: actorUserId, associationSignedAt: sql`now()`, lockedAt: sql`now()` }
    : {};
  const [row] = await currentTx()
    .insert(contracts)
    .values({
      id: newId(),
      associationId,
      projectId,
      bodyTemplate: contract.bodyTemplate,
      templateSha256: sha256Of(contract.bodyTemplate),
      associationSignerName: contract.signerName,
      associationSignerTitle: contract.signerTitle,
      ...signed,
    })
    .returning();
  if (!row) throw new Error('pr.create : contrat non écrit');
  if (contract.signNow) await publishContractLocked(outbox, row, actorUserId);
  return row;
}

/** `contract.signature_required` : inscription en attente de signature (notifications : souscripteur). */
export async function requestContractSignature(
  outbox: OutboxService,
  enrollment: { associationId: string; enrollmentId: string; userId: string; projectId: string },
  actorUserId: string,
): Promise<void> {
  await outbox.publish(currentTx(), {
    type: 'contract.signature_required',
    associationId: enrollment.associationId,
    actorUserId,
    aggregate: { type: 'enrollment', id: enrollment.enrollmentId },
    payload: { enrollmentId: enrollment.enrollmentId, userId: enrollment.userId, projectId: enrollment.projectId },
  });
}

function assertAssociationContext(name: string, associationId: string): void {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error(`${name} : contexte de cette association seulement`);
  }
}

/**
 * Inscription d'un événement de contrat et état du contrat de son projet, lus dans le contexte de son association
 * (notifications) ; `null` si l'inscription n'existe pas (ou plus) dans cette association.
 */
export async function enrollmentContractOf(
  associationId: string,
  enrollmentId: string,
): Promise<{ userId: string; projectId: string; status: string; contractLocked: boolean } | null> {
  assertAssociationContext('enrollmentContractOf', associationId);
  const [row] = await currentTx()
    .select({
      userId: enrollments.userId,
      projectId: enrollments.projectId,
      status: enrollments.status,
      lockedAt: contracts.lockedAt,
    })
    .from(enrollments)
    .leftJoin(
      contracts,
      and(eq(contracts.projectId, enrollments.projectId), eq(contracts.associationId, enrollments.associationId)),
    )
    .where(and(eq(enrollments.associationId, associationId), eq(enrollments.id, enrollmentId)))
    .limit(1);
  return row
    ? { userId: row.userId, projectId: row.projectId, status: row.status, contractLocked: row.lockedAt !== null }
    : null;
}

/** Personnes dont l'inscription au projet attend leur signature (contexte de l'association : notifications). */
export async function pendingSignersOf(associationId: string, projectId: string): Promise<string[]> {
  assertAssociationContext('pendingSignersOf', associationId);
  const rows = await currentTx()
    .select({ userId: enrollments.userId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.associationId, associationId),
        eq(enrollments.projectId, projectId),
        eq(enrollments.status, 'pending_signature'),
      ),
    )
    .orderBy(asc(enrollments.userId));
  return rows.map((r) => r.userId);
}

/**
 * Date de signature du contrat de chaque inscription signée (contexte de l'association : vues gestionnaire). Espace
 * plateforme (membres d'une association, super-admin) : aucune politique de `contract_signatures` ne l'ouvre, donc
 * aucune date (`contractSignedAt` null), plutôt qu'une lecture qui ne rendrait rien.
 */
export async function contractSignedAtOf(
  associationId: string,
  enrollmentIds: readonly string[],
): Promise<Map<string, Date>> {
  if (currentContext()?.space === 'platform') return new Map();
  assertAssociationContext('contractSignedAtOf', associationId);
  if (enrollmentIds.length === 0) return new Map();
  const rows = await currentTx()
    .select({ enrollmentId: contractSignatures.enrollmentId, signedAt: contractSignatures.signedAt })
    .from(contractSignatures)
    .where(
      and(
        eq(contractSignatures.associationId, associationId),
        inArray(contractSignatures.enrollmentId, [...enrollmentIds]),
      ),
    );
  return new Map(rows.map((r) => [r.enrollmentId, r.signedAt]));
}
