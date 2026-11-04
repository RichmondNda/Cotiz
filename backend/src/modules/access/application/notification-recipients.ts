import { memberships, platformStaff } from '@cotiz/db';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

function assertAssociationContext(what: string, associationId: string): void {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error(`${what} : contexte de cette association seulement`);
  }
}

/**
 * Destinataires des notifications de gestion (lot 2.5, architecture/07) : owner et manager actifs de l'association.
 * Un viewer n'est pas notifié : il ne peut ni valider un paiement ni remettre un code. Lu dans le contexte de cette
 * association seulement (RLS tenant_isolation) : un événement de A ne notifie jamais un gestionnaire de B.
 */
export async function notifiedManagersOf(associationId: string): Promise<string[]> {
  assertAssociationContext('notifiedManagersOf', associationId);
  const rows = await currentTx()
    .selectDistinct({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.associationId, associationId),
        eq(memberships.status, 'active'),
        inArray(memberships.role, ['owner', 'manager']),
      ),
    )
    .orderBy(asc(memberships.userId));
  return rows.map((r) => r.userId);
}

/**
 * La personne a-t-elle une appartenance active de souscripteur dans l'association ? Contexte de cette association.
 * Une notification de souscripteur ne va qu'à un souscripteur encore inscrit chez elle.
 */
export async function isActiveSubscriberIn(associationId: string, userId: string): Promise<boolean> {
  assertAssociationContext('isActiveSubscriberIn', associationId);
  const [row] = await currentTx()
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.associationId, associationId),
        eq(memberships.userId, userId),
        eq(memberships.role, 'subscriber'),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Personnel de la plateforme notifié (demandes de création, réinitialisations de la plateforme) : owner et admin, seuls
 * à pouvoir les traiter (permissions.yaml : platform.requests.manage, platform.associations.manage). Table globale.
 */
export async function notifiedPlatformStaff(): Promise<string[]> {
  if (currentContext()?.space !== 'system') throw new Error('notifiedPlatformStaff : espace system seulement');
  const rows = await currentTx()
    .select({ userId: platformStaff.userId })
    .from(platformStaff)
    .where(inArray(platformStaff.role, ['owner', 'admin']))
    .orderBy(asc(platformStaff.userId));
  return rows.map((r) => r.userId);
}
