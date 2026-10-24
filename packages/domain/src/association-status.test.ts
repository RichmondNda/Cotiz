import { describe, expect, it } from 'vitest';
import { ASSOCIATION_STATUSES, associationTransition, DomainError } from './index.js';
import type { AssociationAction, AssociationStatus } from './index.js';

function run(from: AssociationStatus, action: AssociationAction): AssociationStatus | { code: string } {
  try {
    return associationTransition(from, action);
  } catch (e) {
    if (e instanceof DomainError) return { code: e.code };
    throw e;
  }
}

// domain-rules § 8 : `active ↔ suspended`, `active → past_due → suspended` (V2) ; toute autre transition → invalid_state.
describe('associationTransition — domain-rules § 8', () => {
  it.each([
    ['active', 'suspend', 'suspended'],
    ['past_due', 'suspend', 'suspended'],
    ['suspended', 'reactivate', 'active'],
  ] as const)('%s → %s : %s', (from, action, to) => {
    expect(run(from, action)).toBe(to);
  });

  it.each([
    ['onboarding', 'suspend'],
    ['suspended', 'suspend'],
    ['closed', 'suspend'],
    ['onboarding', 'reactivate'],
    ['active', 'reactivate'],
    ['past_due', 'reactivate'],
    ['closed', 'reactivate'],
  ] as const)('%s → %s : invalid_state', (from, action) => {
    expect(run(from, action)).toEqual({ code: 'invalid_state' });
  });

  it('chaque statut et chaque action ont une réponse (jamais d’exception autre que DomainError)', () => {
    for (const from of ASSOCIATION_STATUSES) {
      for (const action of ['suspend', 'reactivate'] as const) expect(() => run(from, action)).not.toThrow();
    }
  });

  it('statut inconnu : invalid_status', () => {
    expect(run('dormant' as AssociationStatus, 'suspend')).toEqual({ code: 'invalid_status' });
  });
});
