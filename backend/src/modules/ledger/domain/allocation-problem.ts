import type { AllocationIssue } from '@cotiz/domain';
import { DomainProblem } from '../../../shared/http/index.js';

/**
 * Erreurs de validateAllocation() → Problem du catalogue (errors.yaml), comme le mock (handlers/ledger.ts) : un
 * dépassement d'abord (`installmentId`, `remaining`), puis l'écart au montant (`expected`, `allocated`) ; les codes
 * hors contrat en 422 `validation_failed`, champ par échéance (`allocations.<id>`) ou sur la liste (décision C5).
 * Échéances de plusieurs inscriptions : `validation_failed` d'abord, l'erreur est là et pas dans un reste dû.
 */
export function allocationProblem(issues: readonly AllocationIssue[]): DomainProblem {
  const mixed = issues.some((i) => i.code === 'mixed_enrollments');
  const exceeds = mixed ? undefined : issues.find((i) => i.code === 'allocation_exceeds_remaining');
  if (exceeds) {
    return new DomainProblem('allocation_exceeds_remaining', {
      installmentId: exceeds.installmentId,
      remaining: exceeds.remaining,
    });
  }
  const mismatch = mixed ? undefined : issues.find((i) => i.code === 'allocation_mismatch');
  if (mismatch) {
    return new DomainProblem('allocation_mismatch', { expected: mismatch.expected, allocated: mismatch.allocated });
  }
  return new DomainProblem('validation_failed', {
    fields: Object.fromEntries(
      issues.map((i) => ['installmentId' in i ? `allocations.${i.installmentId}` : 'allocations', i.code]),
    ),
  });
}
