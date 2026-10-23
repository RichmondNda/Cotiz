import { Injectable } from '@nestjs/common';
import type { AssociationRequestDetail } from '@cotiz/contracts';
import { associationRequests as t } from '@cotiz/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { referencesOf, toDetail } from './request-views.js';

/**
 * pf.req.get : fiche d'une demande. La première ouverture par la plateforme la marque « consultée » (personne, heure),
 * une seule fois même sous ouvertures simultanées (UPDATE conditionnel).
 */
@Injectable()
export class GetRequestUseCase {
  async execute(id: string): Promise<AssociationRequestDetail> {
    const actor = requireActor();
    const tx = currentTx();
    await tx
      .update(t)
      .set({ viewedBy: actor.userId, viewedAt: sql`now()` })
      .where(and(eq(t.id, id), isNull(t.viewedAt)));
    const [row] = await tx.select().from(t).where(eq(t.id, id));
    if (!row) throw new DomainProblem('not_found');
    return toDetail(row, await referencesOf([row]));
  }
}
