import { Injectable } from '@nestjs/common';
import type { Notification } from '@cotiz/contracts';
import { notifications as t } from '@cotiz/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import { UnreadCounter } from '../infra/unread-counter.js';
import { notificationView } from './list-notifications.use-case.js';
import { notificationScopeOf } from './notification-scope.js';

/**
 * nt.read › read : marque lue une notification de l'espace courant ; seule `read_at` change (déjà lue : inchangée).
 * Celle d'une autre personne ou d'un autre espace : 404. Compteur invalidé après le COMMIT.
 */
@Injectable()
export class ReadNotificationUseCase {
  constructor(private readonly counter: UnreadCounter) {}

  async execute(id: string): Promise<AfterCommit<Notification>> {
    const actor = requireActor();
    const scope = await notificationScopeOf(actor);
    if (!scope.where) throw new DomainProblem('not_found');
    const [row] = await currentTx()
      .update(t)
      .set({ readAt: sql`coalesce(${t.readAt}, now())` })
      .where(and(scope.where, eq(t.id, id)))
      .returning();
    if (!row) throw new DomainProblem('not_found');
    const view = notificationView(row);
    return afterCommit(async () => {
      await this.counter.invalidate([actor.userId]);
      return view;
    });
  }
}

/** nt.read › readAll : marque lues toutes les notifications non lues de l'espace courant. */
@Injectable()
export class ReadAllNotificationsUseCase {
  constructor(private readonly counter: UnreadCounter) {}

  async execute(): Promise<AfterCommit<{ updated: number }>> {
    const actor = requireActor();
    const scope = await notificationScopeOf(actor);
    if (!scope.where) return afterCommit(() => Promise.resolve({ updated: 0 }));
    const rows = await currentTx()
      .update(t)
      .set({ readAt: sql`now()` })
      .where(and(scope.where, isNull(t.readAt)))
      .returning({ id: t.id });
    return afterCommit(async () => {
      await this.counter.invalidate([actor.userId]);
      return { updated: rows.length };
    });
  }
}
