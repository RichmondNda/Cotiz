import { Injectable, Logger } from '@nestjs/common';
import { isManagersDigestTime, todayIn } from '@cotiz/domain';
import { notifiedManagersOf } from '../../access/access.public.js';
import { activationCodesCountOf, notifiableUsersOf } from '../../identity/identity.public.js';
import { newLateSubscribersOf, pendingPaymentsCountOf } from '../../ledger/ledger.public.js';
import { activeAssociationTimezones } from '../../tenancy/tenancy.public.js';
import { REDIS_PREFIX } from '../../../shared/queues/index.js';
import { RedisClient } from '../../../shared/redis/redis.module.js';
import { TenantDatabase } from '../../../shared/tenant-context/index.js';
import { managersDigestMessage } from '../domain/messages.js';
import { NotificationAnnouncer } from '../infra/notification-bus.js';
import { UnreadCounter } from '../infra/unread-counter.js';
import { createdInApp, NotificationRouter } from './notification-router.js';

/** Durée d'une marque « journée faite » : couvre la journée locale de tout fuseau, puis disparaît seule. */
const DONE_TTL_SECONDS = 48 * 3600;

/** Marque d'une association dont le récapitulatif du jour local est fait. */
export const managersDigestDoneKeyOf = (associationId: string, day: string) =>
  `${REDIS_PREFIX}:jobs:managers.digest:${associationId}:${day}`;

/** Clé de déduplication de l'envoi (le routeur y ajoute `:{userId}`) : un récapitulatif par jour et par personne. */
export const managersDigestDedupeBaseOf = (associationId: string, day: string) =>
  `digest.daily:${associationId}:${day}`;

/**
 * Tâche `managers.digest` (jobs.yaml, lot 2.6) : lancée toutes les heures à la demie, elle liste en espace system les
 * associations, ni suspendues ni fermées, où il est 07:30 ou plus tard et dont la journée n'est pas faite (marque Redis),
 * puis, dans le contexte de chacune (RLS), compte les paiements à valider, les souscripteurs passés en retard ce jour
 * (fin du délai de grâce, newLateSubscribersOf) et les codes d'activation non remis. Si l'un est non nul, une
 * notification in-app « Récapitulatif du jour » va à chaque owner/manager actif dont le compte est notifiable ; tout à
 * zéro : rien. Marque perdue : la journée est refaite, la cloche reste unique (clé `digest.daily:{aid}:{jour}:{personne}`).
 */
@Injectable()
export class SendManagersDigestUseCase {
  private readonly logger = new Logger(SendManagersDigestUseCase.name);

  constructor(
    private readonly db: TenantDatabase,
    private readonly router: NotificationRouter,
    private readonly counter: UnreadCounter,
    private readonly redis: RedisClient,
    private readonly announcer: NotificationAnnouncer,
  ) {}

  async execute(now: Date): Promise<void> {
    const due = await this.db.withTenantContext({ space: 'system' }, async () =>
      (await activeAssociationTimezones())
        .filter((a) => isManagersDigestTime(a.timezone, now))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    let sent = 0;
    const failures: unknown[] = [];
    // Une association en échec n'empêche pas les autres ; la tâche échoue ensuite pour être reprise.
    for (const association of due) {
      const today = todayIn(association.timezone, now);
      const doneKey = managersDigestDoneKeyOf(association.id, today);
      if (await this.isDone(doneKey)) continue;
      try {
        sent += await this.digest(association.id, today);
        // Après le COMMIT : une marque posée avant pourrait survivre à une transaction annulée et perdre la journée.
        await this.markDone(doneKey);
      } catch (error) {
        this.logger.error({ msg: 'récapitulatif gestionnaire non envoyé', associationId: association.id, err: error });
        failures.push(error);
      }
    }
    if (sent > 0) this.logger.log({ msg: 'récapitulatifs gestionnaire envoyés', count: sent });
    if (failures.length > 0) {
      throw new AggregateError(failures, `managers.digest : ${String(failures.length)} association(s) en échec`);
    }
  }

  /** Nombre de notifications créées pour l'association (0 si rien à signaler ou déjà fait). */
  private async digest(associationId: string, today: string): Promise<number> {
    // Lectures dans le contexte de l'association (RLS) ; l'écriture de la cloche se fait en espace system (non imbriqués).
    const facts = await this.db.withTenantContext({ space: 'association', associationId }, async () => {
      const pendingPayments = await pendingPaymentsCountOf(associationId);
      const newLateSubscribers = (await newLateSubscribersOf(associationId, today)).size;
      const codesToHand = await activationCodesCountOf({ handed: false });
      const managers = await notifiedManagersOf(associationId);
      return { counts: { pendingPayments, newLateSubscribers, codesToHand }, managers };
    });
    const msg = managersDigestMessage(facts.counts);
    if (!msg || facts.managers.length === 0) return 0;
    const deliveries = await this.db.withTenantContext({ space: 'system' }, async () => {
      // Compte désactivé ou anonymisé : plus de notification, même s'il reste membre.
      const notifiable = await notifiableUsersOf(facts.managers);
      const recipients = facts.managers
        .filter((userId) => notifiable.has(userId))
        .map((userId) => ({ userId, associationId, audience: 'manager' as const }));
      if (recipients.length === 0) return [];
      return this.router.dispatch(msg, recipients, {
        dedupeBase: managersDigestDedupeBaseOf(associationId, today),
      });
    });
    const created = createdInApp(deliveries);
    // Après le COMMIT : compteurs de non-lus des personnes qui ont une nouvelle ligne dans la cloche, annonce au flux.
    await this.counter.invalidate(created.map((c) => c.userId));
    await this.announcer.announce(created);
    return created.length;
  }

  /** Redis illisible : la journée est refaite, sans doublon dans la cloche (clé de déduplication). */
  private async isDone(key: string): Promise<boolean> {
    try {
      return (await this.redis.redis.exists(key)) === 1;
    } catch (error) {
      this.logger.warn({ msg: 'marque du récapitulatif illisible', err: (error as Error).name });
      return false;
    }
  }

  private async markDone(key: string): Promise<void> {
    try {
      await this.redis.redis.set(key, '1', 'EX', DONE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn({ msg: 'marque du récapitulatif non posée', err: (error as Error).name });
    }
  }
}
