import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope, EventType } from '@cotiz/contracts';
import { notifications } from '@cotiz/db';
import { Money } from '@cotiz/domain';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { isActiveSubscriberIn, notifiedManagersOf, notifiedPlatformStaff } from '../../access/access.public.js';
import { associationPersonNameOf } from '../../identity/identity.public.js';
import { dueSoonNoticeOf, paymentNoticeOf, pendingPaymentsCountOf } from '../../ledger/ledger.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';
import { NotificationRouter, type RoutedDelivery } from '../application/notification-router.js';
import type { Recipient, RenderedMessage } from '../domain/channel.js';
import { UnreadCounter } from '../infra/unread-counter.js';
import {
  associationRequestSubmittedMessage,
  installmentDueSoonMessage,
  memberEnrolledMessage,
  passwordResetRequestedMessage,
  paymentDeclaredMessage,
  paymentRejectedMessage,
  paymentRevertedMessage,
  paymentsDigestMessage,
  paymentValidatedMessage,
  userActivatedMessage,
} from '../domain/messages.js';

/** Événements notifiés en V1 par ce consommateur (architecture/07). */
export const NOTIFIED_TYPES = [
  'payment.declared',
  'payment.validated',
  'payment.rejected',
  'payment.reverted',
  'member.enrolled',
  'user.activated',
  'password_reset.requested',
  'association.request_submitted',
  'installment.due_soon',
] as const satisfies readonly EventType[];

/** Regroupement (architecture/07) : au-delà de 5 déclarations en 1 h, une notification récapitulative. */
export const DIGEST_THRESHOLD = 5;
const DIGEST_WINDOW_MS = 3_600_000;

const Id = z.uuid();
const Payloads = {
  payment: z.object({ paymentId: Id }),
  validated: z.object({ paymentId: Id, amountReceived: z.int().nonnegative() }),
  enrolled: z.object({ projectId: Id, userId: Id, isNewAccount: z.boolean() }),
  activated: z.object({ userId: Id, associationIds: z.array(Id) }),
  reset: z.object({ userId: Id }),
  request: z.object({ requestId: Id, reference: z.string(), associationName: z.string() }),
  dueSoon: z.object({ userId: Id, projectId: Id, installmentIds: z.array(Id), dueDate: z.iso.date() }),
};

/** Une notification à créer : message, destinataires, base de la clé de déduplication. */
interface Planned {
  msg: RenderedMessage;
  recipients: Recipient[];
  dedupeBase: string;
  /** Déclarations : regroupées au-delà du seuil (association, titre du récapitulatif). */
  digest?: { associationId: string; pendingCount: number };
}

/**
 * Consommateur `notifications` (lot 2.5, architecture/07) : un événement métier → une notification par destinataire,
 * dans la cloche. Deux transactions (ownTransactions) : destinataires et textes lus dans le contexte de l'association
 * de l'événement (RLS : jamais un gestionnaire ni un nom d'une autre association), puis écriture dans l'espace system
 * (`notifications` n'est ouverte qu'au destinataire et au worker). Rejouable : clé `{eventId}:{userId}` unique
 * (ON CONFLICT DO NOTHING). Objet disparu entre-temps (paiement, projet) : rien n'est créé.
 */
@Injectable()
export class NotificationsConsumer implements OnModuleInit, OnModuleDestroy {
  private unregister: (() => void) | undefined;

  constructor(
    private readonly consumers: EventConsumers,
    private readonly db: TenantDatabase,
    private readonly router: NotificationRouter,
    private readonly counter: UnreadCounter,
  ) {}

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'notifications',
      types: NOTIFIED_TYPES,
      ownTransactions: true,
      handle: (event) => this.handle(event),
    });
  }

  onModuleDestroy(): void {
    this.unregister?.();
  }

  async handle(event: EventEnvelope): Promise<void> {
    const planned = await this.plan(event);
    if (planned.length === 0) return;
    const deliveries = await this.db.withTenantContext({ space: 'system' }, async () => {
      const all: RoutedDelivery[] = [];
      for (const p of planned) {
        all.push(
          ...(p.digest
            ? await this.dispatchDeclared(p, p.digest, event)
            : await this.router.dispatch(p.msg, p.recipients, { dedupeBase: p.dedupeBase })),
        );
      }
      return all;
    });
    // Après le COMMIT : compteurs de non-lus des personnes qui ont une nouvelle ligne dans la cloche.
    await this.counter.invalidate(
      deliveries.filter((d) => d.channel === 'in_app' && d.status === 'created').map((d) => d.recipient.userId),
    );
  }

  private inAssociation<T>(associationId: string, fn: () => Promise<T>): Promise<T> {
    return this.db.withTenantContext({ space: 'association', associationId }, fn);
  }

  private async plan(event: EventEnvelope): Promise<Planned[]> {
    const aid = event.associationId;
    switch (event.type) {
      case 'payment.validated':
      case 'payment.rejected':
      case 'payment.reverted':
        return aid ? this.inAssociation(aid, () => this.planSubscriberPayment(event, aid)) : [];
      case 'payment.declared':
        return aid ? this.inAssociation(aid, () => this.planDeclared(event, aid)) : [];
      case 'member.enrolled':
        return aid ? this.inAssociation(aid, () => this.planEnrolled(event, aid)) : [];
      case 'user.activated':
        return this.planActivated(event);
      case 'password_reset.requested':
        return this.planReset(event);
      case 'association.request_submitted':
        return this.planRequest(event);
      case 'installment.due_soon':
        return aid ? this.inAssociation(aid, () => this.planDueSoon(event, aid)) : [];
      default:
        return [];
    }
  }

  private async planSubscriberPayment(event: EventEnvelope, aid: string): Promise<Planned[]> {
    const { paymentId } = Payloads.payment.parse(event.payload);
    const notice = await paymentNoticeOf(aid, paymentId);
    if (!notice) return [];
    let msg: RenderedMessage;
    if (event.type === 'payment.validated') {
      // Montant reçu de l'événement : la ligne relue a pu être annulée (montant effacé) ou revalidée depuis.
      const { amountReceived } = Payloads.validated.parse(event.payload);
      msg = paymentValidatedMessage({ ...notice, amount: Money.of(amountReceived, notice.declared.currency) });
    } else {
      const render = event.type === 'payment.rejected' ? paymentRejectedMessage : paymentRevertedMessage;
      msg = render({ ...notice, amount: notice.declared });
    }
    return [
      {
        msg,
        recipients: [{ userId: notice.userId, associationId: aid, audience: 'subscriber' }],
        dedupeBase: event.id,
      },
    ];
  }

  /**
   * Rappel J-3 : reste dû relu au moment de notifier (déclaré ou soldé entre-temps → rien) ; souscripteur encore actif.
   * Clé `due_soon:{projet}:{date}` (le routeur y ajoute la personne) : relancée le même jour, la tâche republie, la cloche reste unique.
   */
  private async planDueSoon(event: EventEnvelope, aid: string): Promise<Planned[]> {
    const { userId, projectId, installmentIds, dueDate } = Payloads.dueSoon.parse(event.payload);
    if (!(await isActiveSubscriberIn(aid, userId))) return [];
    const notice = await dueSoonNoticeOf(aid, { userId, projectId, installmentIds });
    if (!notice || Money.isZero(notice.remaining)) return [];
    return [
      {
        msg: installmentDueSoonMessage({ ...notice, dueDate }),
        recipients: [{ userId, associationId: aid, audience: 'subscriber' }],
        dedupeBase: `due_soon:${projectId}:${dueDate}`,
      },
    ];
  }

  private async planDeclared(event: EventEnvelope, aid: string): Promise<Planned[]> {
    const { paymentId } = Payloads.payment.parse(event.payload);
    const notice = await paymentNoticeOf(aid, paymentId);
    if (!notice) return [];
    const managers = await notifiedManagersOf(aid);
    const subscriberName = await associationPersonNameOf(aid, notice.userId);
    if (managers.length === 0 || !subscriberName) return [];
    return [
      {
        msg: paymentDeclaredMessage({ ...notice, amount: notice.declared, subscriberName }),
        recipients: managers.map((userId) => ({ userId, associationId: aid, audience: 'manager' })),
        dedupeBase: event.id,
        digest: { associationId: aid, pendingCount: await pendingPaymentsCountOf(aid) },
      },
    ];
  }

  private async planEnrolled(event: EventEnvelope, aid: string): Promise<Planned[]> {
    const { projectId, userId, isNewAccount } = Payloads.enrolled.parse(event.payload);
    // Compte créé par l'inscription : le code d'activation est remis par un gestionnaire (message prêt), pas de cloche.
    if (isNewAccount || !(await isActiveSubscriberIn(aid, userId))) return [];
    const [association, project] = await Promise.all([ownAssociationOf(aid), projectOf(aid, projectId)]);
    if (!association || !project) return [];
    return [
      {
        msg: memberEnrolledMessage({ associationName: association.name, projectId, projectName: project.name }),
        recipients: [{ userId, associationId: aid, audience: 'subscriber' }],
        dedupeBase: event.id,
      },
    ];
  }

  private async planActivated(event: EventEnvelope): Promise<Planned[]> {
    const { userId, associationIds } = Payloads.activated.parse(event.payload);
    const planned: Planned[] = [];
    for (const aid of new Set(associationIds)) {
      const one = await this.inAssociation(aid, async (): Promise<Planned | null> => {
        // Ne pas se fier à la liste de l'événement : souscripteur actif de cette association seulement.
        if (!(await isActiveSubscriberIn(aid, userId))) return null;
        const name = await associationPersonNameOf(aid, userId);
        const managers = await notifiedManagersOf(aid);
        if (!name || managers.length === 0) return null;
        return {
          msg: userActivatedMessage({ userId, name }),
          recipients: managers.map((m) => ({ userId: m, associationId: aid, audience: 'manager' })),
          dedupeBase: `${event.id}:${aid}`,
        };
      });
      if (one) planned.push(one);
    }
    return planned;
  }

  private async planReset(event: EventEnvelope): Promise<Planned[]> {
    const { userId } = Payloads.reset.parse(event.payload);
    const aid = event.associationId;
    if (aid) {
      return this.inAssociation(aid, async (): Promise<Planned[]> => {
        if (!(await isActiveSubscriberIn(aid, userId))) return [];
        const name = await associationPersonNameOf(aid, userId);
        const managers = await notifiedManagersOf(aid);
        if (!name || managers.length === 0) return [];
        return [
          {
            msg: passwordResetRequestedMessage({ audience: 'manager', name }),
            recipients: managers.map((m) => ({ userId: m, associationId: aid, audience: 'manager' })),
            dedupeBase: event.id,
          },
        ];
      });
    }
    return this.planPlatform(event, passwordResetRequestedMessage({ audience: 'platform' }));
  }

  private planRequest(event: EventEnvelope): Promise<Planned[]> {
    return this.planPlatform(event, associationRequestSubmittedMessage(Payloads.request.parse(event.payload)));
  }

  private async planPlatform(event: EventEnvelope, msg: RenderedMessage): Promise<Planned[]> {
    const staff = await this.db.withTenantContext({ space: 'system' }, () => notifiedPlatformStaff());
    if (staff.length === 0) return [];
    return [
      {
        msg,
        recipients: staff.map((userId) => ({ userId, associationId: null, audience: 'platform' })),
        dedupeBase: event.id,
      },
    ];
  }

  /**
   * Déclaration : notification individuelle, sauf pour un gestionnaire qui en a déjà reçu au moins 5 de cette
   * association dans l'heure qui précède l'événement ; il reçoit alors une seule notification récapitulative par heure
   * (clé `digest:{association}:{heure}`). Rejouée, une déclaration déjà notifiée n'est ni recomptée ni regroupée.
   * Lectures en espace system (system_access : toutes les cloches) : toujours filtrées par destinataire et association.
   * Limite acceptée : une déclaration regroupée puis rejouée plus d'une heure après peut produire en plus une
   * notification individuelle (aucune clé individuelle n'a été écrite).
   */
  private async dispatchDeclared(
    p: Planned,
    digest: { associationId: string; pendingCount: number },
    event: EventEnvelope,
  ): Promise<RoutedDelivery[]> {
    const occurredAt = new Date(event.occurredAt);
    const since = new Date(occurredAt.getTime() - DIGEST_WINDOW_MS);
    const individual: Recipient[] = [];
    const grouped: Recipient[] = [];
    for (const r of p.recipients) {
      const tx = currentTx();
      const [already] = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.dedupeKey, `${p.dedupeBase}:${r.userId}`));
      if (already) continue;
      const [recent] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, r.userId),
            eq(notifications.associationId, digest.associationId),
            eq(notifications.type, 'payment.declared'),
            gt(notifications.createdAt, since),
            isNull(sql`${notifications.data}->'digest'`),
          ),
        );
      ((recent?.n ?? 0) >= DIGEST_THRESHOLD ? grouped : individual).push(r);
    }
    const results: RoutedDelivery[] = [];
    if (individual.length > 0) {
      results.push(...(await this.router.dispatch(p.msg, individual, { dedupeBase: p.dedupeBase })));
    }
    if (grouped.length > 0) {
      const hour = occurredAt.toISOString().slice(0, 13);
      results.push(
        ...(await this.router.dispatch(paymentsDigestMessage({ pendingCount: digest.pendingCount }), grouped, {
          dedupeBase: `digest:${digest.associationId}:${hour}`,
        })),
      );
    }
    return results;
  }
}
