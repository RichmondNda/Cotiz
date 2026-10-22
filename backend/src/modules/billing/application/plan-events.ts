import type { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

/** plan.updated (événement de plateforme) : invalide le cache des plans publics, puis les limites en cache (étape 5). */
export function publishPlanUpdated(outbox: OutboxService, planId: string, actorUserId: string | null): Promise<void> {
  return outbox.publish(currentTx(), {
    type: 'plan.updated',
    associationId: null,
    actorUserId,
    aggregate: { type: 'plan', id: planId },
    payload: { planId },
  });
}
