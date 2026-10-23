import type { PlatformAssociationDetail } from '@cotiz/contracts';
import { type Currency, Money } from '@cotiz/domain';
import { membersOf } from '../../access/access.public.js';
import { currentSubscriptionOf } from '../../billing/billing.public.js';
import { platformPersonContactsOf, platformPersonRefsOf } from '../../identity/identity.public.js';
import { platformAssociationOf } from '../../tenancy/tenancy.public.js';
import { DomainProblem } from '../../../shared/http/index.js';

/**
 * Fiche plateforme d'une association qui vient d'être créée (réponse de pf.asso.create et de son rejeu) : association,
 * abonnement en cours, équipe, quotas. Projets et encaissements n'existent pas encore (lots 2.1 et 2.4) : comptés à
 * zéro ; frise réduite à la création. La fiche complète (pf.asso.get) arrive au lot 1.4.
 */
export async function newAssociationDetail(id: string, createdBy: string): Promise<PlatformAssociationDetail> {
  const association = await platformAssociationOf(id);
  if (!association) throw new DomainProblem('not_found');
  const current = await currentSubscriptionOf(id);
  if (!current) throw new Error(`association ${id} sans abonnement en cours`);
  const members = await membersOf(id);
  const contacts = await platformPersonContactsOf(members.managers.map((m) => m.userId));
  const creator = (await platformPersonRefsOf([createdBy])).get(createdBy) ?? null;
  const managers = members.managers.map(({ userId, role }) => {
    const contact = contacts.get(userId);
    if (!contact) throw new Error(`association ${id} : gestionnaire ${userId} introuvable`);
    return { ...contact, role };
  });
  const owner = managers.find((m) => m.role === 'owner');
  if (!owner) throw new Error(`association ${id} sans owner`);
  const { role: _role, ...ownerContact } = owner;
  const currency = association.currency as Currency;
  const createdAt = association.createdAt.toISOString();

  return {
    id: association.id,
    slug: association.slug,
    name: association.name,
    city: association.city,
    country: association.country,
    logoFileId: association.logoFileId,
    status: association.status,
    plan: current.subscription.plan,
    projectsCount: 0,
    subscribersCount: members.subscribers,
    lastActivityAt: null,
    createdAt,
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
    events: [{ type: 'created', at: createdAt, by: creator, detail: null }],
    version: association.version,
  };
}
