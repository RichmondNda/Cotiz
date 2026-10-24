import type { Association } from '@cotiz/contracts';
import type { Currency } from '@cotiz/domain';
import type { AssociationRecord } from './association-records.js';

/** Profil de l'association vu par son gestionnaire (as.get, as.patch, as.onb). */
export function toAssociation(row: AssociationRecord): Association {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type,
    city: row.city,
    country: row.country,
    description: row.description,
    logoFileId: row.logoFileId,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    status: row.status,
    currency: row.currency as Currency,
    timezone: row.timezone,
    defaultGraceDays: row.defaultGraceDays,
    onboardingCompletedAt: row.onboardingCompletedAt?.toISOString() ?? null,
    version: row.version,
  };
}
