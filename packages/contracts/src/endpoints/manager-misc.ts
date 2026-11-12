import { z } from 'zod';
import { EVENT_TYPES } from '../generated/event-types.js';
import {
  BankStatementStatus,
  ImportJobStatus,
  ImportRowCategory,
  ManagerRole,
  MatchStatus,
  MembershipStatus,
  NotificationChannel,
  ReminderRunKind,
  ReminderRunStatus,
  ReminderTrigger,
  WebhookDeliveryStatus,
} from '../common/enums.js';
import { Handoff } from '../common/handoff.js';
import { PaymentSummary } from '../common/ledger.js';
import { listOf, ListQuery } from '../common/list.js';
import { AssociationIdParams, AssociationParams, ProjectParams } from '../common/params.js';
import { Email, PersonContact, PersonRef, PhoneE164 } from '../common/people.js';
import { QuotaUsage } from '../common/plan.js';
import { ProjectRef } from '../common/project.js';
import { Instant, IsoDate, Money, Uuid } from '../common/scalars.js';
import { defineEndpoint, noFlags } from '../registry.js';

// Contrats, imports, relances, équipe, rapprochement, API et webhooks (docs/ui/manager.md).

// ---------------------------------------------------------------- Contrats (lot 4.1)

export const ProjectContract = z.object({
  id: Uuid,
  projectId: Uuid,
  /** Modèle ; `{nom_souscripteur}` est remplacé dans le contrat de chaque souscripteur. */
  bodyTemplate: z.string(),
  templateSha256: z.string().regex(/^[0-9a-f]{64}$/),
  signer: z.object({ name: z.string(), title: z.string() }),
  associationSignedAt: Instant.nullable(),
  associationSignedBy: PersonRef.nullable(),
  /** Verrouillé : plus aucune modification. */
  lockedAt: Instant.nullable(),
  signatures: z.object({ signed: z.int().nonnegative(), total: z.int().nonnegative() }),
  unsigned: z.array(z.object({ enrollmentId: Uuid, member: PersonRef, enrolledAt: Instant })),
  pdfFileId: Uuid.nullable(),
  /** Verrouillage optimiste (`If-Match` de `update` et `lock`). */
  version: z.int().min(1),
});

export const ctGet = defineEndpoint({
  id: 'ct.get',
  space: 'association',
  permission: 'association.read',
  errors: ['contract_locked', 'version_conflict'],
  flags: { ...noFlags, ifMatch: true, audited: true },
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/projects/{pid}/contract',
      request: { params: ProjectParams },
      response: { status: 200, body: ProjectContract },
    },
    update: {
      method: 'PUT',
      path: '/api/v1/associations/{aid}/projects/{pid}/contract',
      request: {
        params: ProjectParams,
        body: z.object({
          bodyTemplate: z.string().min(1),
          signerName: z.string().min(1).max(120),
          signerTitle: z.string().min(1).max(120),
        }),
      },
      response: { status: 200, body: ProjectContract },
    },
    /** Signature de l'association et verrouillage. */
    lock: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/projects/{pid}/contract/lock',
      request: { params: ProjectParams },
      response: { status: 200, body: ProjectContract },
    },
  },
});

export const ContractSummary = z.object({
  project: ProjectRef,
  createdAt: Instant,
  lockedAt: Instant.nullable(),
  signed: z.int().nonnegative(),
  total: z.int().nonnegative(),
  unsignedOver7Days: z.int().nonnegative(),
});

export const ctList = defineEndpoint({
  id: 'ct.list',
  space: 'association',
  permission: 'association.read',
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/contracts',
      request: { params: AssociationParams, query: ListQuery },
      response: { status: 200, body: listOf(ContractSummary) },
    },
  },
});

// ---------------------------------------------------------------- Imports (lot 4.4)

export const ImportField = z.enum(['firstName', 'lastName', 'phone', 'email', 'address']);

/** Champs sans lesquels une ligne ne peut pas être inscrite (NewMemberInput). */
export const IMPORT_REQUIRED_FIELDS = ['firstName', 'lastName', 'phone'] as const;

/** Lignes de données au plus dans un fichier (lot 4.4 : 5 000 lignes), en plus de la ligne d'en-tête. */
export const IMPORT_MAX_ROWS = 5000;

/**
 * Motif d'un import `failed` : fichier refusé par l'analyse antivirus, illisible (ni CSV ni XLSX valide), sans ligne
 * de données ou sans en-tête, au-delà de IMPORT_MAX_ROWS ; `internal` : exécution interrompue (erreur imprévue).
 */
/** Motif d'échec ; `requester_removed` : la personne qui a lancé l'envoi ne gère plus l'association (lot 4.4). */
export const ImportFailure = z.enum([
  'file_rejected',
  'unreadable',
  'empty',
  'too_many_rows',
  'requester_removed',
  'internal',
]);

export const ImportJob = z.object({
  id: Uuid,
  projectId: Uuid,
  sourceFileId: Uuid,
  /**
   * `uploaded` : fichier en cours d'analyse ; `mapped` : colonnes détectées, lignes en cours de classement ;
   * `validated` : lignes classées, prêtes à l'envoi ; `importing` : inscriptions en cours ; `completed` ; `failed`.
   */
  status: ImportJobStatus,
  /** Colonnes du fichier, 3 valeurs d'exemple, champ Cotiz retenu (`null` = ignorée). */
  columns: z.array(z.object({ name: z.string(), samples: z.array(z.string()).max(3), field: ImportField.nullable() })),
  counts: z.record(ImportRowCategory, z.int().nonnegative()),
  /**
   * Exécution (`importing`, `completed`) : lignes traitées sur le total à inscrire ; nouveaux comptes (codes à
   * remettre), comptes existants rattachés, lignes refusées. `null` avant l'envoi.
   */
  progress: z
    .object({
      total: z.int().nonnegative(),
      processed: z.int().nonnegative(),
      enrolled: z.int().nonnegative(),
      attached: z.int().nonnegative(),
      failed: z.int().nonnegative(),
    })
    .nullable(),
  failure: ImportFailure.nullable(),
  createdAt: Instant,
});

export const ImportRow = z.object({
  id: Uuid,
  rowNumber: z.int().min(1),
  category: ImportRowCategory,
  values: z.partialRecord(ImportField, z.string()),
  /**
   * Erreurs de la ligne : `required`, `invalid_phone`, `invalid_email`, `too_long` sur un champ ; après l'envoi, code
   * d'erreur du cas d'usage d'inscription (`already_enrolled`, `quota_exceeded`, `invalid_state`…), sans champ.
   */
  errors: z.array(z.object({ field: ImportField.nullable(), code: z.string() })),
  /** Doublon : ligne d'origine. */
  duplicateOf: z.int().min(1).nullable(),
  /** Compte existant rattaché. */
  existingUserId: Uuid.nullable(),
});

const ImportParams = AssociationIdParams;

export const imFlow = defineEndpoint({
  id: 'im.flow',
  space: 'association',
  permission: 'members.manage',
  errors: ['file_type_not_allowed', 'quota_exceeded'],
  flags: { ...noFlags, idempotencyKey: true },
  operations: {
    create: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/projects/{pid}/imports',
      request: { params: ProjectParams, body: z.object({ fileId: Uuid }) },
      response: { status: 201, body: ImportJob },
    },
  },
});

export const imSteps = defineEndpoint({
  id: 'im.steps',
  space: 'association',
  permission: 'members.manage',
  errors: ['invalid_state', 'validation_failed'],
  flags: noFlags,
  operations: {
    mapping: {
      method: 'PATCH',
      path: '/api/v1/associations/{aid}/imports/{id}/mapping',
      request: {
        params: ImportParams,
        body: z.object({ mapping: z.record(z.string(), ImportField.nullable()) }),
      },
      response: { status: 200, body: ImportJob },
    },
    row: {
      method: 'PATCH',
      path: '/api/v1/associations/{aid}/imports/{id}/rows/{rowId}',
      request: {
        params: ImportParams.extend({ rowId: Uuid }),
        body: z.object({ values: z.partialRecord(ImportField, z.string()).optional(), ignore: z.boolean().optional() }),
      },
      response: { status: 200, body: ImportRow },
    },
  },
});

export const imRead = defineEndpoint({
  id: 'im.read',
  space: 'association',
  permission: 'members.manage',
  errors: [],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/imports/{id}',
      request: { params: ImportParams },
      response: { status: 200, body: ImportJob },
    },
    rows: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/imports/{id}/rows',
      request: { params: ImportParams, query: ListQuery.extend({ category: ImportRowCategory.optional() }) },
      response: { status: 200, body: listOf(ImportRow) },
    },
  },
});

export const imCommit = defineEndpoint({
  id: 'im.commit',
  space: 'association',
  permission: 'members.manage',
  errors: ['invalid_state', 'quota_exceeded'],
  flags: { ...noFlags, idempotencyKey: true, audited: true },
  operations: {
    /** Exécution asynchrone ; les nouveaux comptes apparaissent dans « Codes à remettre ». */
    commit: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/imports/{id}/commit',
      request: { params: ImportParams },
      response: { status: 202, body: ImportJob },
    },
  },
});

// ---------------------------------------------------------------- Relances (lot 4.3)

export const ReminderRule = z.object({
  id: Uuid,
  /** `null` = tous les projets. */
  projectId: Uuid.nullable(),
  trigger: ReminderTrigger,
  offsetDays: z.int().min(0).max(60),
  /** `in_app`, `push` ; `sms` et `email` seulement si la fonctionnalité est activée. */
  channels: z.array(NotificationChannel).min(1),
  /** Message avec variables ; sert aussi au message prêt. */
  message: z.string().max(1000),
  isActive: z.boolean(),
  createdAt: Instant,
});

export const ReminderRuleInput = ReminderRule.omit({ id: true, createdAt: true });

export const rmRules = defineEndpoint({
  id: 'rm.rules',
  space: 'association',
  permission: 'reminders.send',
  errors: ['validation_failed'],
  flags: { ...noFlags, audited: true },
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/reminder-rules',
      request: { params: AssociationParams },
      response: { status: 200, body: z.object({ items: z.array(ReminderRule) }) },
    },
    create: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/reminder-rules',
      request: { params: AssociationParams, body: ReminderRuleInput },
      response: { status: 201, body: ReminderRule },
    },
    patch: {
      method: 'PATCH',
      path: '/api/v1/associations/{aid}/reminder-rules/{id}',
      request: { params: AssociationIdParams, body: ReminderRuleInput.partial() },
      response: { status: 200, body: ReminderRule },
    },
  },
});

/** Entrée de la file « À relancer » : message prêt à copier, WhatsApp ou `sms:`. */
export const ReminderQueueEntry = z.object({
  id: Uuid,
  member: PersonContact,
  project: ProjectRef,
  installmentId: Uuid,
  dueDate: IsoDate,
  amountDue: Money,
  lateSince: IsoDate.nullable(),
  kind: ReminderRunKind,
  status: ReminderRunStatus,
  message: z.string(),
  whatsappUrl: z.url().nullable(),
  smsUrl: z.string().startsWith('sms:').nullable(),
  createdAt: Instant,
});

export const SendReminderInput = z.union([
  /** Tous les retardataires d'un projet. */
  z.object({ projectId: Uuid, allLate: z.literal(true), message: z.string().max(1000).optional() }),
  /** Sélection libre. */
  z.object({
    userIds: z.array(Uuid).min(1).max(500),
    projectId: Uuid.optional(),
    message: z.string().max(1000).optional(),
  }),
]);

export const rmSend = defineEndpoint({
  id: 'rm.send',
  space: 'association',
  permission: 'reminders.send',
  errors: ['too_many_requests'],
  flags: { idempotencyKey: true, ifMatch: false, rateLimited: true, audited: true },
  operations: {
    /** Rappel in-app/push au souscripteur et entrée dans « À relancer ». */
    send: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/reminders',
      request: { params: AssociationParams, body: SendReminderInput },
      response: { status: 202, body: z.object({ queued: z.array(ReminderQueueEntry) }) },
    },
  },
});

export const rmQueue = defineEndpoint({
  id: 'rm.queue',
  space: 'association',
  permission: 'reminders.send',
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/reminders/queue',
      request: {
        params: AssociationParams,
        query: ListQuery.extend({ status: ReminderRunStatus.optional(), projectId: Uuid.optional() }),
      },
      response: { status: 200, body: listOf(ReminderQueueEntry) },
    },
    handled: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/reminders/queue/{id}/handled',
      request: { params: AssociationIdParams, body: z.object({ outcome: z.enum(['handled', 'dismissed']) }) },
      response: { status: 200, body: ReminderQueueEntry },
    },
  },
});

export const ReminderHistoryEntry = z.object({
  id: Uuid,
  at: Instant,
  kind: ReminderRunKind,
  status: ReminderRunStatus,
  member: PersonRef,
  project: ProjectRef,
  channels: z.array(z.string()),
  message: z.string().nullable(),
  /** Gestionnaire (relance manuelle) ; `null` pour une règle. */
  triggeredBy: PersonRef.nullable(),
  ruleId: Uuid.nullable(),
});

export const rmHist = defineEndpoint({
  id: 'rm.hist',
  space: 'association',
  permission: 'association.read',
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/reminders/history',
      request: { params: AssociationParams, query: ListQuery.extend({ projectId: Uuid.optional() }) },
      response: { status: 200, body: listOf(ReminderHistoryEntry) },
    },
  },
});

// ---------------------------------------------------------------- Équipe (lot 4.5)

export const TeamMember = z.object({
  member: PersonRef.extend({ email: Email, phone: PhoneE164.nullable() }),
  role: ManagerRole,
  /** Fonction affichée (« Trésorière ») ; `null` si non renseignée. */
  title: z.string().nullable(),
  status: MembershipStatus,
  lastLoginAt: Instant.nullable(),
});

export const TeamParams = AssociationParams.extend({ uid: Uuid });

export const tmTeam = defineEndpoint({
  id: 'tm.team',
  space: 'association',
  permission: 'association.team.manage',
  errors: ['last_owner', 'quota_exceeded'],
  flags: { ...noFlags, audited: true },
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/team',
      request: { params: AssociationParams },
      response: { status: 200, body: z.object({ items: z.array(TeamMember), seats: QuotaUsage }) },
    },
    /** Invitation par code d'activation affiché avec message prêt. */
    invite: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/team/invitations',
      request: {
        params: AssociationParams,
        body: z.object({
          firstName: z.string().min(1).max(80),
          lastName: z.string().min(1).max(80),
          email: Email,
          phone: PhoneE164.optional(),
          role: ManagerRole,
          message: z.string().max(500).optional(),
        }),
      },
      response: { status: 201, body: z.object({ member: TeamMember, handoff: Handoff }) },
    },
    patch: {
      method: 'PATCH',
      path: '/api/v1/associations/{aid}/team/{uid}',
      request: { params: TeamParams, body: z.object({ role: ManagerRole }) },
      response: { status: 200, body: TeamMember },
    },
    /** Retrait : sessions révoquées. */
    remove: {
      method: 'DELETE',
      path: '/api/v1/associations/{aid}/team/{uid}',
      request: { params: TeamParams },
      response: { status: 204 },
    },
  },
});

// ---------------------------------------------------------------- Rapprochement (lot 5.1)

export const BankStatement = z.object({
  id: Uuid,
  fileId: Uuid,
  formatKey: z.string(),
  status: BankStatementStatus,
  periodStart: IsoDate.nullable(),
  periodEnd: IsoDate.nullable(),
  counts: z.record(z.string(), z.int().nonnegative()),
  createdBy: PersonRef,
  createdAt: Instant,
});

export const bkStatements = defineEndpoint({
  id: 'bk.statements',
  space: 'association',
  permission: 'payments.review',
  errors: ['file_type_not_allowed', 'validation_failed'],
  flags: { ...noFlags, idempotencyKey: true, audited: true },
  operations: {
    create: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/bank-statements',
      request: {
        params: AssociationParams,
        body: z.object({
          fileId: Uuid,
          /** Mappage mémorisé par format ; requis pour un format inconnu. */
          formatKey: z.string().min(1).optional(),
          columnMapping: z.record(z.string(), z.string()).optional(),
        }),
      },
      response: { status: 201, body: BankStatement },
    },
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/bank-statements',
      request: { params: AssociationParams, query: ListQuery },
      response: { status: 200, body: listOf(BankStatement) },
    },
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/bank-statements/{id}',
      request: { params: AssociationIdParams },
      response: { status: 200, body: BankStatement },
    },
  },
});

export const MatchProposal = z.object({
  lineId: Uuid,
  line: z.object({
    lineNo: z.int().min(1),
    bookedOn: IsoDate,
    amount: Money,
    reference: z.string().nullable(),
    counterparty: z.string().nullable(),
  }),
  payment: PaymentSummary.nullable(),
  /** Score de confiance entre 0 et 1. */
  score: z.number().min(0).max(1).nullable(),
  status: MatchStatus,
});

export const bkMatch = defineEndpoint({
  id: 'bk.match',
  space: 'association',
  permission: 'payments.review',
  errors: ['payment_already_reviewed', 'allocation_mismatch'],
  flags: { ...noFlags, idempotencyKey: true, audited: true },
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/bank-statements/{id}/matches',
      request: { params: AssociationIdParams, query: ListQuery.extend({ status: MatchStatus.optional() }) },
      response: { status: 200, body: listOf(MatchProposal) },
    },
    /** Confirmation = validation des paiements concernés. */
    confirm: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/bank-statements/{id}/matches/confirm',
      request: { params: AssociationIdParams, body: z.object({ lineIds: z.array(Uuid).min(1).max(500) }) },
      response: { status: 200, body: z.object({ validatedPaymentIds: z.array(Uuid) }) },
    },
  },
});

// ---------------------------------------------------------------- API et webhooks (lot 5.2)

export const ApiKey = z.object({
  id: Uuid,
  name: z.string(),
  /** Début de la clé, affiché pour la reconnaître. */
  prefix: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: Instant.nullable(),
  createdBy: PersonRef,
  createdAt: Instant,
  revokedAt: Instant.nullable(),
});

export const devKeys = defineEndpoint({
  id: 'dev.keys',
  space: 'association',
  permission: 'association.settings.manage',
  errors: ['quota_exceeded'],
  flags: { ...noFlags, audited: true },
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/api-keys',
      request: { params: AssociationParams },
      response: { status: 200, body: z.object({ items: z.array(ApiKey) }) },
    },
    /** La clé complète n'est affichée qu'une fois (stockée hachée). */
    create: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/api-keys',
      request: {
        params: AssociationParams,
        body: z.object({ name: z.string().min(1).max(80), scopes: z.array(z.string()).min(1) }),
      },
      response: { status: 201, body: z.object({ key: ApiKey, secret: z.string().min(32) }) },
    },
    revoke: {
      method: 'DELETE',
      path: '/api/v1/associations/{aid}/api-keys/{id}',
      request: { params: AssociationIdParams },
      response: { status: 204 },
    },
  },
});

export const EventTypeSchema = z.enum(EVENT_TYPES);

export const Webhook = z.object({
  id: Uuid,
  url: z.url(),
  events: z.array(EventTypeSchema).min(1),
  isActive: z.boolean(),
  createdAt: Instant,
});

export const WebhookDelivery = z.object({
  id: Uuid,
  /** Identifiant séquentiel de l'événement (bigserial), en chaîne. */
  eventId: z.string().regex(/^\d+$/),
  status: WebhookDeliveryStatus,
  attempts: z.int().nonnegative(),
  lastStatusCode: z.int().nullable(),
  nextAttemptAt: Instant.nullable(),
  createdAt: Instant,
});

export const devWebhooks = defineEndpoint({
  id: 'dev.webhooks',
  space: 'association',
  permission: 'association.settings.manage',
  errors: ['validation_failed'],
  flags: { ...noFlags, audited: true },
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/webhooks',
      request: { params: AssociationParams },
      response: { status: 200, body: z.object({ items: z.array(Webhook) }) },
    },
    /** Le secret de signature HMAC n'est affiché qu'une fois. */
    create: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/webhooks',
      request: {
        params: AssociationParams,
        body: z.object({ url: z.url(), events: z.array(EventTypeSchema).min(1) }),
      },
      response: { status: 201, body: z.object({ webhook: Webhook, secret: z.string().min(32) }) },
    },
    patch: {
      method: 'PATCH',
      path: '/api/v1/associations/{aid}/webhooks/{id}',
      request: {
        params: AssociationIdParams,
        body: z.object({ url: z.url(), events: z.array(EventTypeSchema).min(1), isActive: z.boolean() }).partial(),
      },
      response: { status: 200, body: Webhook },
    },
    deliveries: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/webhooks/{id}/deliveries',
      request: { params: AssociationIdParams, query: ListQuery },
      response: { status: 200, body: listOf(WebhookDelivery) },
    },
  },
});
