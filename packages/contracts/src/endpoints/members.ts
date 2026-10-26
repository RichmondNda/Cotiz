import { z } from 'zod';
import { ERROR_CODES } from '../generated/error-codes.js';
import { MemberStanding } from '../common/enums.js';
import { Handoff } from '../common/handoff.js';
import { listOf, ListQuery } from '../common/list.js';
import { Enrollment, EnrollmentWithSchedule, MemberProfile } from '../common/member.js';
import { AssociationParams, MemberParams, ProjectParams } from '../common/params.js';
import { Email, PersonContact, PhoneE164 } from '../common/people.js';
import { ProjectRef } from '../common/project.js';
import { Instant, IsoDate, Money, Uuid } from '../common/scalars.js';
import { EventTone } from '../common/tone.js';
import { defineEndpoint, noFlags } from '../registry.js';

// Souscripteurs et inscriptions (docs/ui/manager.md : mg-add-souscripteur, mg-projet-souscripteurs, mg-annuaire,
// mg-fiche, mg-codes ; architecture/04-flows.md § 4.3).

const read = 'association.read';
const manage = 'members.manage';

// ---------------------------------------------------------------- Recherche et inscription

export const LookupInput = z.object({ phone: PhoneE164, projectId: Uuid });

/** Compte existant : prénom et initiale du nom seulement (l'endpoint ne doit pas servir d'annuaire). */
export const LookupPerson = z.object({ id: Uuid, firstName: z.string(), lastInitial: z.string().length(1) });

export const LookupResult = z.discriminatedUnion('result', [
  z.object({ result: z.literal('new') }),
  /** Associations où la personne a une appartenance non retirée, quel que soit le rôle (0 : aucune). */
  z.object({ result: z.literal('existing_user'), person: LookupPerson, associationsCount: z.int().nonnegative() }),
  z.object({ result: z.literal('already_enrolled'), person: LookupPerson }),
]);

export const mbLookup = defineEndpoint({
  id: 'mb.lookup',
  space: 'association',
  permission: manage,
  errors: ['invalid_phone'],
  flags: { ...noFlags, rateLimited: true, audited: true },
  operations: {
    lookup: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/members/lookup',
      request: { params: AssociationParams, body: LookupInput },
      response: { status: 200, body: LookupResult },
    },
  },
});

export const EnrollmentsQuery = ListQuery.extend({
  standing: MemberStanding.optional(),
  q: z.string().min(1).optional(),
});

export const enList = defineEndpoint({
  id: 'en.list',
  space: 'association',
  permission: read,
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/projects/{pid}/enrollments',
      request: { params: ProjectParams, query: EnrollmentsQuery },
      response: { status: 200, body: listOf(Enrollment) },
    },
  },
});

/** Nouveau compte : identité saisie par le gestionnaire. */
export const NewMemberInput = z.object({
  phone: PhoneE164,
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: Email.nullable().optional(),
  address: z.string().max(200).nullable().optional(),
});

export const CreateEnrollmentInput = z.union([
  /** Compte existant retrouvé par `mb.lookup`. */
  z.object({ userId: Uuid, startsFrom: IsoDate.optional() }),
  NewMemberInput.extend({ startsFrom: IsoDate.optional() }),
]);

/** Le message prêt n'est renvoyé que pour un nouveau compte. */
export const EnrollmentCreated = z.object({ enrollment: Enrollment, handoff: Handoff.nullable() });

export const enCreate = defineEndpoint({
  id: 'en.create',
  space: 'association',
  permission: manage,
  errors: ['already_enrolled', 'quota_exceeded', 'invalid_state', 'invalid_phone'],
  flags: { ...noFlags, idempotencyKey: true, audited: true },
  operations: {
    create: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/projects/{pid}/enrollments',
      request: { params: ProjectParams, body: CreateEnrollmentInput },
      response: { status: 201, body: EnrollmentCreated },
    },
  },
});

export const enWithdraw = defineEndpoint({
  id: 'en.withdraw',
  space: 'association',
  permission: manage,
  errors: ['invalid_state'],
  flags: { ...noFlags, audited: true },
  operations: {
    /** Échéances futures annulées, historique conservé. */
    withdraw: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/enrollments/{eid}/withdraw',
      request: {
        params: AssociationParams.extend({ eid: Uuid }),
        body: z.object({ reason: z.string().max(500).optional() }),
      },
      response: { status: 200, body: Enrollment },
    },
  },
});

/** Une personne de l'ajout en lot ; une ligne invalide est rapportée (`validation_failed`), les autres sont traitées. */
export const BulkEnrollmentRow = NewMemberInput.extend({ startsFrom: IsoDate.optional() });

/**
 * Le serveur valide chaque ligne à part : une ligne invalide ressort `failed` + `validation_failed` (champs) dans le
 * rapport au lieu de faire échouer le lot ; seule l'enveloppe (projet, 1 à 200 lignes) répond 422.
 */
export const BulkEnrollmentInput = z.object({
  projectId: Uuid,
  rows: z.array(BulkEnrollmentRow).min(1).max(200),
});

export const BulkEnrollmentReport = z.object({
  results: z.array(
    z.object({
      /** Rang dans `rows`, à partir de 0. */
      index: z.int().nonnegative(),
      outcome: z.enum(['enrolled', 'attached', 'already_enrolled', 'failed']),
      enrollmentId: Uuid.nullable(),
      errorCode: z.enum(ERROR_CODES).nullable(),
      /** Erreurs de champ (`validation_failed`). */
      fields: z.record(z.string(), z.string()).nullable(),
    }),
  ),
  /** Nouveaux comptes : codes visibles dans « Codes à remettre ». */
  newAccounts: z.int().nonnegative(),
});

export const enBulk = defineEndpoint({
  id: 'en.bulk',
  space: 'association',
  permission: manage,
  errors: ['quota_exceeded', 'validation_failed'],
  flags: { ...noFlags, idempotencyKey: true, audited: true },
  operations: {
    create: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/enrollments/bulk',
      request: { params: AssociationParams, body: BulkEnrollmentInput },
      response: { status: 200, body: BulkEnrollmentReport },
    },
  },
});

// ---------------------------------------------------------------- Codes d'activation

export const mbResend = defineEndpoint({
  id: 'mb.resend',
  space: 'association',
  permission: manage,
  /** `invalid_state` : compte créé par une autre association (code d'origine), désactivé, anonymisé, personnel plateforme. */
  errors: ['already_activated', 'invalid_state'],
  flags: { ...noFlags, rateLimited: true, audited: true },
  operations: {
    /** Régénère le code (l'ancien est invalidé). */
    regenerate: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/members/{uid}/activation-code',
      request: { params: MemberParams },
      response: { status: 200, body: Handoff },
    },
  },
});

/** État du dernier code d'activation émis par l'association (un code consommé n'est plus listé). */
export const ActivationCodeState = z.enum(['live', 'expired', 'blocked']);

/** Compte non activé et le dernier code émis par l'association, lisible en clair jusqu'à consommation. */
export const ActivationCodeEntry = z.object({
  /** Identifiant du code. */
  id: Uuid,
  member: PersonContact,
  /** `expired` (délai passé ou code remplacé), `blocked` (5 essais) : plus de code à remettre, « Régénérer ». */
  state: ActivationCodeState,
  /** Message prêt avec le code en clair, seulement si `state` = `live`. */
  handoff: Handoff.nullable(),
  issuedAt: Instant,
  /** Marqué « remis » par un gestionnaire. */
  handedAt: Instant.nullable(),
});

export const ActivationCodeList = listOf(ActivationCodeEntry);
export const ActivationCodesQuery = ListQuery.extend({ handed: z.stringbool().optional() });
export const ActivationCodeParams = AssociationParams.extend({ codeId: Uuid });

export const mbCodes = defineEndpoint({
  id: 'mb.codes',
  space: 'association',
  permission: manage,
  errors: [],
  flags: { ...noFlags, audited: true },
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/activation-codes',
      request: { params: AssociationParams, query: ActivationCodesQuery },
      response: { status: 200, body: ActivationCodeList },
    },
    markHanded: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/activation-codes/{codeId}/handed',
      request: { params: ActivationCodeParams },
      response: { status: 200, body: ActivationCodeEntry },
    },
  },
});

// ---------------------------------------------------------------- Annuaire et fiche

export const MemberSummary = z.object({
  member: PersonContact,
  projects: z.array(ProjectRef),
  totalPaid: Money,
  totalRemaining: Money,
  /** Pire situation de ses projets. */
  standing: MemberStanding,
});

export const mbList = defineEndpoint({
  id: 'mb.list',
  space: 'association',
  permission: read,
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/members',
      request: {
        params: AssociationParams,
        query: ListQuery.extend({
          /** Nom ou téléphone (recherche trigramme). */
          q: z.string().min(1).optional(),
          projectId: Uuid.optional(),
          standing: MemberStanding.optional(),
        }),
      },
      response: { status: 200, body: listOf(MemberSummary) },
    },
  },
});

export const MemberDetail = z.object({
  member: MemberProfile,
  /** Première inscription à un projet de l'association. */
  memberSince: Instant,
  standing: MemberStanding,
  enrollments: z.array(EnrollmentWithSchedule),
  version: z.int().min(1),
});

export const mbGet = defineEndpoint({
  id: 'mb.get',
  space: 'association',
  permission: read,
  errors: ['not_found'],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/members/{uid}',
      request: { params: MemberParams },
      response: { status: 200, body: MemberDetail },
    },
  },
});

export const PatchMemberInput = z
  .object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    phone: PhoneE164,
    email: Email.nullable(),
    address: z.string().max(200).nullable(),
    city: z.string().max(80).nullable(),
  })
  .partial();

export const mbPatch = defineEndpoint({
  id: 'mb.patch',
  space: 'association',
  permission: manage,
  errors: ['phone_taken', 'version_conflict'],
  flags: { ...noFlags, ifMatch: true, audited: true },
  operations: {
    patch: {
      method: 'PATCH',
      path: '/api/v1/associations/{aid}/members/{uid}',
      request: { params: MemberParams, body: PatchMemberInput },
      response: { status: 200, body: MemberDetail },
    },
  },
});

/** Événement de la frise : paiement, validation, relance, signature… */
export const TimelineEvent = z.object({
  id: z.string(),
  at: Instant,
  type: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  tone: EventTone,
  project: ProjectRef.nullable(),
});

export const mbTimeline = defineEndpoint({
  id: 'mb.timeline',
  space: 'association',
  permission: read,
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/members/{uid}/timeline',
      request: { params: MemberParams, query: ListQuery },
      response: { status: 200, body: listOf(TimelineEvent) },
    },
  },
});
