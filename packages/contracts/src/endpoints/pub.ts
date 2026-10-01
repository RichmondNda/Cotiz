import { z } from 'zod';
import { AssociationIdentity, ContactPerson, RequestNeeds } from '../common/association.js';
import { Email } from '../common/people.js';
import { PublicPlan } from '../common/plan.js';
import { IsoDate, Uuid } from '../common/scalars.js';
import { defineEndpoint, noFlags } from '../registry.js';

export const PublicPlanList = z.object({ items: z.array(PublicPlan) });

export const pubPlans = defineEndpoint({
  id: 'pub.plans',
  space: 'public',
  permission: 'public',
  errors: [],
  flags: noFlags,
  operations: {
    list: { method: 'GET', path: '/api/v1/public/plans', request: {}, response: { status: 200, body: PublicPlanList } },
  },
});

/** Formulaire `/demande` en 3 étapes, avec l'anti-abus sans service tiers (décision n° 12). */
export const AssociationRequestInput = z.object({
  association: AssociationIdentity.extend({
    /** Description de l'activité, 500 caractères au plus. */
    activityDescription: z.string().min(1).max(500),
  }),
  contact: ContactPerson.extend({ title: z.string().min(1).max(80) }),
  needs: RequestNeeds,
  termsAccepted: z.literal(true),
  /** Champ piège, invisible pour une personne : doit rester vide. */
  website: z.literal('').optional(),
  /** Solution de la preuve de travail ALTCHA auto-hébergée (base64). */
  altcha: z.string().min(1),
});
export type AssociationRequestInput = z.infer<typeof AssociationRequestInput>;

export const AssociationRequestCreated = z.object({
  id: Uuid,
  /** Référence affichée en police mono sur la confirmation. */
  reference: z.string().min(1),
  /** Adresse à laquelle la réponse sera envoyée. */
  contactEmail: Email,
});

export const pubRequest = defineEndpoint({
  id: 'pub.request',
  space: 'public',
  permission: 'public',
  errors: ['validation_failed', 'too_many_requests', 'challenge_failed'],
  flags: { ...noFlags, idempotencyKey: true, rateLimited: true },
  operations: {
    create: {
      method: 'POST',
      path: '/api/v1/public/association-requests',
      request: { body: AssociationRequestInput },
      response: { status: 201, body: AssociationRequestCreated },
    },
  },
});

export const LegalSlug = z.enum(['cgu', 'confidentialite', 'mentions']);

export const LegalPage = z.object({
  slug: LegalSlug,
  title: z.string(),
  version: z.string(),
  updatedOn: IsoDate,
  /** Texte versionné en Markdown ; le sommaire est construit à partir des titres. */
  markdown: z.string(),
});

export const pubLegal = defineEndpoint({
  id: 'pub.legal',
  space: 'public',
  permission: 'public',
  errors: ['not_found'],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/public/legal/{slug}',
      request: { params: z.object({ slug: LegalSlug }) },
      response: { status: 200, body: LegalPage },
    },
  },
});
