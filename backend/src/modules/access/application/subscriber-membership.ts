import { memberships } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { and, eq, sql } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import type { MembershipStatus } from './memberships.js';

/**
 * Appartenance souscripteur de la personne dans l'association du contexte, verrouillée jusqu'à la fin de la transaction
 * (inscription : à suivre d'`admitSubscriber`) ; `null` si elle n'en a jamais eu.
 */
export async function subscriberMembershipOf(associationId: string, userId: string): Promise<MembershipStatus | null> {
  assertAssociation(associationId, 'subscriberMembershipOf');
  // Verrou consultatif : sans ligne, FOR UPDATE ne verrouille rien, et deux inscriptions simultanées de la même
  // personne (deux projets) créeraient deux fois l'appartenance (UNIQUE association, personne, rôle).
  await currentTx().execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`memberships:${associationId}:${userId}:subscriber`}, 0))`,
  );
  const [row] = await currentTx()
    .select({ status: memberships.status })
    .from(memberships)
    .where(
      and(
        eq(memberships.associationId, associationId),
        eq(memberships.userId, userId),
        eq(memberships.role, 'subscriber'),
      ),
    )
    .for('update');
  return row?.status ?? null;
}

/**
 * Souscripteur admis dans l'association : appartenance créée, ou rétablie si elle avait été retirée, toujours `active`
 * dès l'inscription (comme l'owner au lot 1.3) ; « activation en attente » se lit sur le compte. L'appelant a contrôlé le
 * quota (QuotaService) : une appartenance non retirée compte un souscripteur.
 */
export async function admitSubscriber(associationId: string, userId: string, invitedBy: string): Promise<void> {
  assertAssociation(associationId, 'admitSubscriber');
  const tx = currentTx();
  const [restored] = await tx
    .update(memberships)
    .set({ status: 'active', removedAt: null, joinedAt: sql`now()`, invitedBy })
    .where(
      and(
        eq(memberships.associationId, associationId),
        eq(memberships.userId, userId),
        eq(memberships.role, 'subscriber'),
        eq(memberships.status, 'removed'),
      ),
    )
    .returning({ id: memberships.id });
  if (restored) return;
  await tx.insert(memberships).values({
    id: newId(),
    associationId,
    userId,
    role: 'subscriber',
    status: 'active',
    invitedBy,
    joinedAt: sql`now()`,
  });
}

function assertAssociation(associationId: string, what: string): void {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error(`${what} : contexte de l’association attendu`);
  }
}
