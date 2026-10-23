import type { PlanRef, PlatformAssociationDetail, PlatformAssociationSummary } from '@cotiz/contracts';
import { type Currency, Money } from '@cotiz/domain';
import { type AssociationTeam, membersOf, teamsOf } from '../../access/access.public.js';
import { latestSubscriptionOf } from '../../billing/billing.public.js';
import {
  platformManagerActivityOf,
  platformPersonContactsOf,
  platformPersonRefsOf,
} from '../../identity/identity.public.js';
import { platformAuditTrailOf } from '../../../shared/audit/index.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { type AssociationRecord, platformAssociationOf } from './association-records.js';

/** Actions du journal reprises dans la frise de la fiche, et le type d'événement affiché (libellés côté front). */
const TIMELINE: Readonly<Record<string, string>> = {
  'association_request.approve': 'request.approved',
  'association.update': 'association.updated',
};
/** Création directe : son auteur signe l'entrée « association.created » qui clôt toujours la frise. */
const CREATE_ACTION = 'association.create';
const TIMELINE_LIMIT = 20;

/**
 * Dernière activité de chaque association : la plus récente des sessions de ses gestionnaires actifs (identity), en
 * attendant les agrégats d'usage du lot 4.6. Limite connue : une session ne porte pas d'association, la connexion
 * d'une personne qui gère plusieurs associations compte pour chacune d'elles.
 */
export async function lastActivitiesOf(teams: ReadonlyMap<string, AssociationTeam>): Promise<Map<string, Date>> {
  const activity = await platformManagerActivityOf([...teams.values()].flatMap((t) => t.activeManagerIds));
  const latest = new Map<string, Date>();
  for (const [associationId, team] of teams) {
    for (const userId of team.activeManagerIds) {
      const at = activity.get(userId);
      const known = latest.get(associationId);
      if (at && (!known || at > known)) latest.set(associationId, at);
    }
  }
  return latest;
}

/** Ligne de la liste plateforme. Projets : aucun avant le lot 2.1. */
export function toSummary(
  row: AssociationRecord,
  plan: PlanRef,
  team: AssociationTeam | undefined,
  lastActivity: Date | undefined,
): PlatformAssociationSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    country: row.country,
    logoFileId: row.logoFileId,
    status: row.status,
    plan,
    projectsCount: 0,
    subscribersCount: team?.subscribers ?? 0,
    lastActivityAt: lastActivity?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Fiche plateforme d'une association (pf.asso.get, réponse de pf.asso.create) : profil, abonnement en cours (à défaut
 * le plus récent), équipe, quotas, frise tirée du journal d'audit et close par la création. Projets et encaissements n'existent pas encore
 * (lots 2.1 et 2.4) : comptés à zéro, taux de recouvrement `null`. 404 si l'association n'existe pas.
 */
export async function platformAssociationDetail(id: string): Promise<PlatformAssociationDetail> {
  const association = await platformAssociationOf(id);
  if (!association) throw new DomainProblem('not_found');
  const current = await latestSubscriptionOf(id);
  if (!current) throw new Error(`association ${id} sans abonnement`);
  const members = await membersOf(id);
  const teams = await teamsOf([id]);
  const lastActivity = (await lastActivitiesOf(teams)).get(id);
  const contacts = await platformPersonContactsOf(members.managers.map((m) => m.userId));
  const managers = members.managers.map(({ userId, role }) => {
    const contact = contacts.get(userId);
    if (!contact) throw new Error(`association ${id} : gestionnaire ${userId} introuvable`);
    return { ...contact, role };
  });
  const owner = managers.find((m) => m.role === 'owner');
  if (!owner) throw new Error(`association ${id} sans owner`);
  const { role: _role, ...ownerContact } = owner;
  const currency = association.currency as Currency;

  // Création lue à part : aucune limite de la frise ne fait perdre son auteur.
  const trail = await platformAuditTrailOf(id, Object.keys(TIMELINE), TIMELINE_LIMIT - 1);
  const creator = (await platformAuditTrailOf(id, [CREATE_ACTION], 1))[0]?.actorUserId ?? null;
  const authors = await platformPersonRefsOf([
    ...trail.flatMap((e) => (e.actorUserId ? [e.actorUserId] : [])),
    ...(creator ? [creator] : []),
  ]);
  const authorOf = (userId: string | null) => (userId === null ? null : (authors.get(userId) ?? null));

  return {
    ...toSummary(association, current.subscription.plan, teams.get(id), lastActivity),
    type: association.type,
    description: association.description,
    contactEmail: association.contactEmail,
    contactPhone: association.contactPhone,
    currency,
    timezone: association.timezone,
    suspendedAt: association.suspendedAt?.toISOString() ?? null,
    suspensionReason: association.suspensionReason,
    onboardingCompletedAt: association.onboardingCompletedAt?.toISOString() ?? null,
    owner: ownerContact,
    managers,
    subscription: current.subscription,
    quotas: {
      projects: { used: 0, limit: current.limits.projects },
      subscribers: { used: members.subscribers, limit: current.limits.subscribers },
      managers: { used: managers.length, limit: current.limits.managers },
    },
    kpi: {
      activeProjects: 0,
      subscribers: members.subscribers,
      collectedTotal: Money.zero(currency),
      recoveryRate: null,
    },
    // Toujours au moins la création, à la date d'entrée de l'association (approbation, création directe, seed).
    events: [
      ...trail.flatMap((e) => {
        const type = TIMELINE[e.action];
        return type ? [{ type, at: e.occurredAt.toISOString(), by: authorOf(e.actorUserId), detail: null }] : [];
      }),
      { type: 'association.created', at: association.createdAt.toISOString(), by: authorOf(creator), detail: null },
    ],
    version: association.version,
  };
}
