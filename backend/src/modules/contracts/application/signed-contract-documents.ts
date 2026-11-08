import type { ContractDocumentInput } from '@cotiz/pdf-templates';
import { contracts, contractSignatures, enrollments } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import type { UserProfiles } from '../../identity/identity.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { sha256Of } from './contract-records.js';

/**
 * Contenu du PDF d'une signature (worker documents), lu dans le contexte de son association : signature, contrat
 * verrouillé, inscription, projet, association et souscripteur. Le texte est celui figé à la signature
 * (`rendered_body`), qui doit redonner l'empreinte signée : sinon erreur, jamais de PDF d'un autre texte que celui signé.
 * `null` : signature inconnue dans cette association.
 */
export async function signedContractDocumentOf(
  associationId: string,
  signatureId: string,
  profiles: UserProfiles,
): Promise<{ input: ContractDocumentInput; pdfFileId: string } | null> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error('signedContractDocumentOf : contexte de cette association attendu');
  }
  const tx = currentTx();
  const [signature] = await tx
    .select()
    .from(contractSignatures)
    .where(and(eq(contractSignatures.id, signatureId), eq(contractSignatures.associationId, associationId)));
  if (!signature) return null;
  const [contract] = await tx
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, signature.contractId), eq(contracts.associationId, associationId)));
  const [enrollment] = await tx
    .select({ projectId: enrollments.projectId, userId: enrollments.userId })
    .from(enrollments)
    .where(and(eq(enrollments.id, signature.enrollmentId), eq(enrollments.associationId, associationId)));
  if (!contract?.associationSignedAt || enrollment?.userId !== signature.userId) {
    throw new Error(`contrat signé ${signatureId} : contrat verrouillé ou inscription introuvable`);
  }
  const project = await projectOf(associationId, enrollment.projectId);
  const association = await ownAssociationOf(associationId);
  const profile = await profiles.read(signature.userId);
  if (!project || !association || !profile) {
    throw new Error(`contrat signé ${signatureId} : projet, association ou souscripteur introuvable`);
  }
  // Texte figé à la signature : un renommage ultérieur (projet, association, souscripteur) ne le change pas.
  if (sha256Of(signature.renderedBody) !== signature.renderedSha256) {
    throw new Error(`contrat signé ${signatureId} : le texte stocké ne redonne plus l'empreinte signée`);
  }
  return {
    pdfFileId: signature.pdfFileId,
    input: {
      association: { name: association.name },
      project: { name: project.name },
      body: signature.renderedBody,
      associationSigner: {
        name: contract.associationSignerName,
        title: contract.associationSignerTitle,
        signedAt: contract.associationSignedAt.toISOString(),
      },
      subscriber: { name: `${profile.firstName} ${profile.lastName}`.trim(), phone: profile.phone },
      signature: {
        id: signature.id,
        enrollmentId: signature.enrollmentId,
        signedAt: signature.signedAt.toISOString(),
        ip: signature.ip,
        userAgent: signature.userAgent,
        consentText: signature.consentText,
        renderedSha256: signature.renderedSha256,
        templateSha256: contract.templateSha256,
      },
      timezone: association.timezone,
    },
  };
}
