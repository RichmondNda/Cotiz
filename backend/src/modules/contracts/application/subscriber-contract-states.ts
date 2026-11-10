import { contracts, contractSignatures } from '@cotiz/db';
import { and, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

/** Inscription de la personne connectée dont on veut l'état du contrat. */
export interface SubscriberContractKey {
  enrollmentId: string;
  projectId: string;
  associationId: string;
  userId: string;
}

/** `locked` : le contrat du projet est verrouillé (signable) ; `signedAt` : signature de la personne, sinon `null`. */
export interface SubscriberContractState {
  locked: boolean;
  signedAt: Date | null;
}

/**
 * État du contrat de chaque inscription (espace subscriber : me.dash, me.project). Seul un contrat verrouillé se signe
 * (décision du 2026-11-10 : un brouillon n'est jamais annoncé au souscripteur) ; la RLS `subscriber_enrolled_read`
 * (0019) ne laisse lire que ceux-là ou ceux qu'il a signés, le code filtre aussi par projet, association et
 * verrouillage, et la signature par personne (défense en profondeur). Inscription sans contrat : absente du résultat.
 */
export async function subscriberContractStatesOf(
  keys: readonly SubscriberContractKey[],
): Promise<Map<string, SubscriberContractState>> {
  const states = new Map<string, SubscriberContractState>();
  if (keys.length === 0) return states;
  if (currentContext()?.space !== 'subscriber')
    throw new Error('subscriberContractStatesOf : espace subscriber seulement');
  const projectIds = [...new Set(keys.map((k) => k.projectId))];
  const lockedRows = await currentTx()
    .select({ projectId: contracts.projectId, associationId: contracts.associationId })
    .from(contracts)
    .where(and(inArray(contracts.projectId, projectIds), isNotNull(contracts.lockedAt)));
  const locked = new Set(lockedRows.map((r) => `${r.associationId}:${r.projectId}`));
  const signatureRows = await currentTx()
    .select({
      enrollmentId: contractSignatures.enrollmentId,
      userId: contractSignatures.userId,
      signedAt: contractSignatures.signedAt,
    })
    .from(contractSignatures)
    .where(
      or(
        ...keys.map((k) =>
          and(eq(contractSignatures.enrollmentId, k.enrollmentId), eq(contractSignatures.userId, k.userId)),
        ),
      ),
    );
  const signed = new Map(signatureRows.map((r) => [`${r.enrollmentId}:${r.userId}`, r.signedAt]));
  for (const k of keys) {
    const signedAt = signed.get(`${k.enrollmentId}:${k.userId}`) ?? null;
    const isLocked = locked.has(`${k.associationId}:${k.projectId}`);
    if (isLocked || signedAt) states.set(k.enrollmentId, { locked: isLocked, signedAt });
  }
  return states;
}
