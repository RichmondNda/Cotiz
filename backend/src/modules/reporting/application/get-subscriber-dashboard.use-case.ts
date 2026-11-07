import { Injectable } from '@nestjs/common';
import { ENDPOINTS } from '@cotiz/contracts';
import { type Currency, Money, subscriberSummary } from '@cotiz/domain';
import type { z } from 'zod';
import { subscriberPaymentsOf } from '../../ledger/ledger.public.js';
import { subscriberEnrollmentsOf } from '../../members/members.public.js';
import { requireActor } from '../../../shared/http/index.js';
import { RedisClient } from '../../../shared/redis/redis.module.js';
import { readSubscriberDashboard, writeSubscriberDashboard } from '../infra/subscriber-dashboard-cache.js';
import { associationRefOf, sortedCards } from './subscriber-cards.js';

type Dashboard = z.infer<(typeof ENDPOINTS)['me.dash']['operations']['get']['response']['body']>;

/** Devise des totaux d'une personne sans inscription. */
const DEFAULT_CURRENCY: Currency = 'XOF';
const RECENT_PAYMENTS = 3;

/**
 * me.dash : tableau de bord souscripteur (mb-dashboard), toutes associations, en cache 30 s par personne
 * (architecture/09), invalidé par les événements qui la concernent (SubscriberDashboardCacheConsumer, worker).
 * - cartes : une par inscription non retirée (subscriberCard, mêmes chiffres que la vue gestionnaire), triées retard,
 *   signature, prochaine échéance (sortedCards) ;
 * - reste, retard et prochaine échéance : inscriptions qui engagent seulement (subscriberSummary) ;
 * - contrats à signer : inscriptions en attente de signature ; 3 derniers paiements déclarés.
 */
@Injectable()
export class GetSubscriberDashboardUseCase {
  constructor(private readonly redis: RedisClient) {}

  async execute(): Promise<Dashboard> {
    const { userId } = requireActor();
    const cached = await readSubscriberDashboard(this.redis.redis, userId);
    if (cached.dashboard) return cached.dashboard;
    const dashboard = await this.compute();
    await writeSubscriberDashboard(this.redis.redis, userId, dashboard, cached.generation);
    return dashboard;
  }

  private async compute(): Promise<Dashboard> {
    const entries = sortedCards(await subscriberEnrollmentsOf());
    const currencies = new Set(entries.map((e) => e.card.remaining.currency));
    // Les totaux additionnent des montants : jamais deux devises (le contrat n'a qu'un montant par total).
    if (currencies.size > 1) throw new Error('me.dash : inscriptions dans plusieurs devises');
    const currency = entries[0]?.card.remaining.currency ?? DEFAULT_CURRENCY;
    const money = (amount: number) => Money.of(amount, currency);
    const summary = subscriberSummary(
      entries.map(({ entry, card }) => ({
        status: entry.row.status,
        remaining: card.remaining.amount,
        late: card.late ? { count: card.late.count, amount: card.late.amount.amount } : null,
        nextDue: card.nextDue ? { dueDate: card.nextDue.dueDate, amount: card.nextDue.amount.amount } : null,
      })),
    );
    const next = summary.nextDueIndex === null ? undefined : entries[summary.nextDueIndex];
    const recentPayments = await subscriberPaymentsOf(
      entries.map((e) => e.entry.row.id),
      {
        projects: new Map(entries.map((e) => [e.entry.project.id, e.entry.project])),
        associations: new Map(entries.map((e) => [e.entry.association.id, associationRefOf(e.entry)])),
      },
      { limit: RECENT_PAYMENTS },
    );
    return {
      remainingTotal: money(summary.remainingTotal),
      projectsCount: entries.length,
      associationsCount: new Set(entries.map((e) => e.entry.association.id)).size,
      late: summary.late ? { count: summary.late.count, amount: money(summary.late.amount) } : null,
      nextDue: next?.card.nextDue
        ? {
            project: { id: next.entry.project.id, name: next.entry.project.name },
            association: associationRefOf(next.entry),
            dueDate: next.card.nextDue.dueDate,
            amount: next.card.nextDue.amount,
          }
        : null,
      contractsToSign: entries
        .filter((e) => e.entry.row.status === 'pending_signature')
        .map((e) => ({
          project: { id: e.entry.project.id, name: e.entry.project.name },
          association: associationRefOf(e.entry),
        })),
      projects: entries.map((e) => e.card),
      recentPayments,
    };
  }
}
