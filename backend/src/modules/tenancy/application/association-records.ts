import { associations } from '@cotiz/db';
import { eq, inArray } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

export type AssociationRecord = typeof associations.$inferSelect;

/** Une association, lue par la plateforme (fiche d'une association) ; `null` si elle n'existe pas. */
export async function platformAssociationOf(id: string): Promise<AssociationRecord | null> {
  if (currentContext()?.space !== 'platform') throw new Error('platformAssociationOf : espace plateforme seulement');
  const [row] = await currentTx().select().from(associations).where(eq(associations.id, id));
  return row ?? null;
}

/**
 * Fuseau de chaque association demandée (jour civil des échéances, domain-rules § 6), pour les tâches (espace system,
 * politique `system_read`) et la plateforme ; les identifiants inconnus sont absents.
 */
export async function associationTimezonesOf(ids: readonly string[]): Promise<Map<string, string>> {
  const space = currentContext()?.space;
  if (space !== 'system' && space !== 'platform') {
    throw new Error('associationTimezonesOf : espace system ou plateforme seulement');
  }
  if (ids.length === 0) return new Map();
  const rows = await currentTx()
    .select({ id: associations.id, timezone: associations.timezone })
    .from(associations)
    .where(inArray(associations.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r.timezone]));
}

export type AssociationOverview = Pick<
  AssociationRecord,
  'id' | 'name' | 'status' | 'createdAt' | 'onboardingCompletedAt'
>;

/** Toutes les associations, réduites à ce que le tableau de bord plateforme surveille. Plateforme seulement. */
export async function platformAssociationsOverview(): Promise<AssociationOverview[]> {
  if (currentContext()?.space !== 'platform') {
    throw new Error('platformAssociationsOverview : espace plateforme seulement');
  }
  return currentTx()
    .select({
      id: associations.id,
      name: associations.name,
      status: associations.status,
      createdAt: associations.createdAt,
      onboardingCompletedAt: associations.onboardingCompletedAt,
    })
    .from(associations);
}

/**
 * Identifiant de l'association du contexte, vérifié contre le `{aid}` de l'URL (comparé en minuscules, comme
 * MembershipGuard). Refusé hors du contexte de cette association.
 */
export function contextAssociationId(aid: string): string {
  const context = currentContext();
  const id = aid.toLowerCase();
  if (context?.space !== 'association' || context.associationId !== id) {
    throw new Error('contexte de cette association attendu');
  }
  return id;
}

/** L'association du contexte, lue par son gestionnaire (RLS `tenant_self`) ; `null` si elle n'est pas lisible. */
export async function ownAssociationOf(aid: string): Promise<AssociationRecord | null> {
  const id = contextAssociationId(aid);
  const [row] = await currentTx().select().from(associations).where(eq(associations.id, id));
  return row ?? null;
}
