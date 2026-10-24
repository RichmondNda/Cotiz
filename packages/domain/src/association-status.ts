import { DomainError } from './errors.js';

/** Statuts d'une association (schema.sql : associations.status). */
export const ASSOCIATION_STATUSES = ['onboarding', 'active', 'past_due', 'suspended', 'closed'] as const;
export type AssociationStatus = (typeof ASSOCIATION_STATUSES)[number];

/** Actions de la plateforme sur le statut d'une association (pf.asso.suspend). */
export type AssociationAction = 'suspend' | 'reactivate';

/**
 * Transitions de domain-rules § 8 : `active ↔ suspended`, `active → past_due → suspended` (V2). La réactivation ramène
 * toujours à `active`. Toute autre transition : `invalid_state` ; statut inconnu : `invalid_status`.
 */
const TRANSITIONS: Readonly<Record<AssociationAction, { from: readonly AssociationStatus[]; to: AssociationStatus }>> =
  {
    suspend: { from: ['active', 'past_due'], to: 'suspended' },
    reactivate: { from: ['suspended'], to: 'active' },
  };

export function associationTransition(from: AssociationStatus, action: AssociationAction): AssociationStatus {
  if (!(ASSOCIATION_STATUSES as readonly string[]).includes(from)) throw new DomainError('invalid_status');
  const transition = TRANSITIONS[action];
  if (!transition.from.includes(from)) throw new DomainError('invalid_state', { from, action });
  return transition.to;
}
