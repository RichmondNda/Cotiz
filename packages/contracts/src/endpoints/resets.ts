import { z } from 'zod';
import { Handoff } from '../common/handoff.js';
import { ResetRequestSpace, ResetRequestStatus } from '../common/enums.js';
import { listOf, ListQuery } from '../common/list.js';
import { AssociationIdParams, AssociationParams, IdParams } from '../common/params.js';
import { PersonContact, PersonRef } from '../common/people.js';
import { Instant, Uuid } from '../common/scalars.js';
import { defineEndpoint } from '../registry.js';

// Demandes « mot de passe oublié » traitées par le rôle supérieur (architecture/03-auth.md) : gestionnaire pour un
// souscripteur (`as.resets`), super-admin pour un gestionnaire (`pf.resets`).

export const PasswordResetRequest = z.object({
  id: Uuid,
  space: ResetRequestSpace,
  status: ResetRequestStatus,
  user: PersonContact,
  createdAt: Instant,
  handledAt: Instant.nullable(),
  handledBy: PersonRef.nullable(),
});
export type PasswordResetRequest = z.infer<typeof PasswordResetRequest>;

export const ResetRequestsQuery = ListQuery.extend({ status: ResetRequestStatus.optional() });
export const ResetRequestList = listOf(PasswordResetRequest);

/** Code à 6 chiffres (15 min) affiché une fois, avec le message prêt. */
export const IssuedResetCode = z.object({ request: PasswordResetRequest, handoff: Handoff });

export const asResets = defineEndpoint({
  id: 'as.resets',
  space: 'association',
  permission: 'members.manage',
  errors: ['not_found', 'request_already_handled'],
  flags: { idempotencyKey: false, ifMatch: false, rateLimited: false, audited: true },
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/password-reset-requests',
      request: { params: AssociationParams, query: ResetRequestsQuery },
      response: { status: 200, body: ResetRequestList },
    },
    issueCode: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/password-reset-requests/{id}/issue-code',
      request: { params: AssociationIdParams },
      response: { status: 200, body: IssuedResetCode },
    },
  },
});

export const pfResets = defineEndpoint({
  id: 'pf.resets',
  space: 'platform',
  permission: 'platform.associations.manage',
  errors: ['not_found', 'request_already_handled'],
  flags: { idempotencyKey: false, ifMatch: false, rateLimited: false, audited: true },
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/platform/password-reset-requests',
      request: { query: ResetRequestsQuery },
      response: { status: 200, body: ResetRequestList },
    },
    issueCode: {
      method: 'POST',
      path: '/api/v1/platform/password-reset-requests/{id}/issue-code',
      request: { params: IdParams },
      response: { status: 200, body: IssuedResetCode },
    },
  },
});
