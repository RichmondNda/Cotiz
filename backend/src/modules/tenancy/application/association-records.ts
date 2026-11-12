import { associations } from '@cotiz/db';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
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

/** Associations dont les souscripteurs ne reçoivent plus de rappel : activité arrêtée par la plateforme ou fermée. */
const SILENT_ASSOCIATION_STATUSES = ['suspended', 'closed'] as const;

/**
 * Fuseau des associations demandées qui reçoivent encore les rappels d'échéance (tâche `installments.due-soon`, lot
 * 2.5) : ni suspendues ni fermées. Espace system seulement ; les identifiants inconnus ou écartés sont absents.
 */
export async function remindableAssociationTimezonesOf(ids: readonly string[]): Promise<Map<string, string>> {
  if (currentContext()?.space !== 'system') {
    throw new Error('remindableAssociationTimezonesOf : espace system seulement');
  }
  if (ids.length === 0) return new Map();
  const rows = await currentTx()
    .select({ id: associations.id, timezone: associations.timezone })
    .from(associations)
    .where(
      and(
        inArray(associations.id, [...new Set(ids)]),
        notInArray(associations.status, [...SILENT_ASSOCIATION_STATUSES]),
      ),
    );
  return new Map(rows.map((r) => [r.id, r.timezone]));
}

/**
 * Toutes les associations qui reçoivent encore les notifications récurrentes (récapitulatif gestionnaire, lot 2.6) : ni
 * suspendues ni fermées, avec leur fuseau. Espace system seulement.
 */
export async function activeAssociationTimezones(): Promise<{ id: string; timezone: string }[]> {
  if (currentContext()?.space !== 'system') throw new Error('activeAssociationTimezones : espace system seulement');
  return currentTx()
    .select({ id: associations.id, timezone: associations.timezone })
    .from(associations)
    .where(notInArray(associations.status, [...SILENT_ASSOCIATION_STATUSES]))
    .orderBy(associations.id);
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

/** Ce que l'espace souscripteur présente d'une association : référence et fuseau (jour civil des échéances). */
export interface SubscriberAssociation {
  id: string;
  name: string;
  logoFileId: string | null;
  timezone: string;
  /** Suspendue par la plateforme : présentée marquée, aucune déclaration (décision utilisateur du 2026-11-10). */
  suspended: boolean;
}

/**
 * Associations demandées, lues par la personne connectée en espace subscriber (RLS `member_read` : celles où elle a
 * une appartenance active, **quel que soit le rôle**) ; les autres sont absentes. Le rôle souscripteur se filtre chez
 * l'appelant (`subscriberEnrollmentsOf`).
 */
export async function subscriberAssociationsOf(ids: readonly string[]): Promise<Map<string, SubscriberAssociation>> {
  if (currentContext()?.space !== 'subscriber') {
    throw new Error('subscriberAssociationsOf : espace souscripteur seulement');
  }
  if (ids.length === 0) return new Map();
  const rows = await currentTx()
    .select({
      id: associations.id,
      name: associations.name,
      logoFileId: associations.logoFileId,
      timezone: associations.timezone,
      status: associations.status,
    })
    .from(associations)
    .where(inArray(associations.id, [...new Set(ids)]));
  return new Map(rows.map(({ status, ...r }) => [r.id, { ...r, suspended: status === 'suspended' }]));
}

/** Fiche publique d'une association pour l'espace souscripteur (me.assos) : lieu, présentation et contact. */
export interface SubscriberAssociationDetails extends SubscriberAssociation {
  city: string;
  country: string;
  description: string | null;
  contactEmail: string;
  contactPhone: string;
}

/**
 * Fiches des associations demandées, lues en espace subscriber (RLS `member_read`, comme `subscriberAssociationsOf`) ;
 * les autres sont absentes. Le rôle souscripteur se filtre chez l'appelant.
 */
export async function subscriberAssociationDetailsOf(
  ids: readonly string[],
): Promise<Map<string, SubscriberAssociationDetails>> {
  if (currentContext()?.space !== 'subscriber') {
    throw new Error('subscriberAssociationDetailsOf : espace souscripteur seulement');
  }
  if (ids.length === 0) return new Map();
  const rows = await currentTx()
    .select({
      id: associations.id,
      name: associations.name,
      logoFileId: associations.logoFileId,
      timezone: associations.timezone,
      status: associations.status,
      city: associations.city,
      country: associations.country,
      description: associations.description,
      contactEmail: associations.contactEmail,
      contactPhone: associations.contactPhone,
    })
    .from(associations)
    .where(inArray(associations.id, [...new Set(ids)]));
  return new Map(rows.map(({ status, ...r }) => [r.id, { ...r, suspended: status === 'suspended' }]));
}
