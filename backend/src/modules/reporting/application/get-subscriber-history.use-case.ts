import { Injectable } from '@nestjs/common';
import { ENDPOINTS } from '@cotiz/contracts';
import { type Currency, Money, subscriberHistoryFigures, subscriberSummary } from '@cotiz/domain';
import type { z } from 'zod';
import {
  type SubscriberPaymentRefs,
  subscriberPaymentsPage,
  subscriberValidatedPaymentsOf,
} from '../../ledger/ledger.public.js';
import { type SubscriberEnrollment, subscriberEnrollmentsOf } from '../../members/members.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { decodeCursor } from '../../../shared/pagination/index.js';
import { associationRefOf, subscriberCard } from './subscriber-cards.js';

type HistoryOps = (typeof ENDPOINTS)['me.history']['operations'];
type ListQuery = z.infer<HistoryOps['list']['request']['query']>;
type SeriesQuery = z.infer<HistoryOps['series']['request']['query']>;
type History = z.infer<HistoryOps['list']['response']['body']>;
type Series = z.infer<HistoryOps['series']['response']['body']>;

/** Devise des totaux d'une personne sans inscription (comme me.dash). */
const DEFAULT_CURRENCY: Currency = 'XOF';

/** Inscriptions de la sélection : celles présentées au souscripteur (me.dash), filtrées par association et projet. */
async function selected(filters: { associationId?: string; projectId?: string }) {
  const entries = (
    await subscriberEnrollmentsOf({
      includeWithdrawn: true,
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
    })
  ).filter((e) => !filters.associationId || e.association.id === filters.associationId);
  const refs: SubscriberPaymentRefs = {
    projects: new Map(entries.map((e) => [e.project.id, { id: e.project.id, name: e.project.name }])),
    associations: new Map(entries.map((e) => [e.association.id, associationRefOf(e)])),
    withdrawnEnrollments: new Set(entries.filter((e) => e.row.status === 'withdrawn').map((e) => e.row.id)),
  };
  const currencies = new Set(entries.map((e) => e.project.currency));
  // Les totaux additionnent des montants : jamais deux devises (le contrat n'a qu'un montant par total).
  if (currencies.size > 1) throw new Error('me.history : inscriptions dans plusieurs devises');
  const currency = (entries[0]?.project.currency as Currency | undefined) ?? DEFAULT_CURRENCY;
  return {
    entries,
    refs,
    ids: entries.map((e) => e.row.id),
    currency,
    money: (amount: number) => Money.of(amount, currency),
  };
}

/** Versements validés de la sélection, tous dans la devise de ses projets (jamais deux devises additionnées). */
async function validatedOf(s: Awaited<ReturnType<typeof selected>>, q: { from?: string; to?: string }) {
  const validated = await subscriberValidatedPaymentsOf(s.ids, s.refs, period(q));
  if (validated.some((v) => v.currency !== s.currency)) throw new Error('me.history : paiement dans une autre devise');
  return validated;
}

const period = (q: { from?: string; to?: string }) => ({
  ...(q.from === undefined ? {} : { from: q.from }),
  ...(q.to === undefined ? {} : { to: q.to }),
});

const commitments = (entries: readonly SubscriberEnrollment[]) =>
  entries.map((e) => ({ status: e.row.status, commitment: subscriberCard(e).commitment?.amount ?? null }));

/**
 * me.history (mb-historique, lot 3.4), personne du jeton, inscriptions des associations où elle est souscriptrice
 * active, **retirées comprises** (paiements en lecture seule, `enrollmentWithdrawn`, décision du 2026-11-10), filtrées
 * par association, projet et date de virement (`paidOn`) ; reste et objectif : inscriptions qui engagent seulement :
 * - liste : tous statuts, les plus récents d'abord (date de déclaration), paginée ;
 * - synthèse : versé et nombre des validés de la sélection (subscriberHistoryFigures : l'encaissé du gestionnaire pour
 *   cette personne), reste des inscriptions qui engagent (subscriberSummary, sans la période : un reste n'a pas de date) ;
 * - série : versé par mois de virement de la période, cumul depuis le début (versements antérieurs à `from`
 *   compris), et objectif (engagements des inscriptions qui engagent).
 */
@Injectable()
export class GetSubscriberHistoryUseCase {
  async list(query: ListQuery): Promise<History> {
    const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && !after) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }
    if (query.sort !== undefined) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const s = await selected(query);
    const page = await subscriberPaymentsPage(s.ids, s.refs, { ...period(query), limit: query.limit, after });
    const validated = await validatedOf(s, query);
    const figures = subscriberHistoryFigures(validated, []);
    const summary = subscriberSummary(
      s.entries.map((e) => {
        const card = subscriberCard(e);
        return {
          status: e.row.status,
          remaining: card.remaining.amount,
          late: card.late ? { count: card.late.count, amount: card.late.amount.amount } : null,
          nextDue: card.nextDue ? { dueDate: card.nextDue.dueDate, amount: card.nextDue.amount.amount } : null,
        };
      }),
    );
    return {
      ...page,
      summary: {
        totalPaid: s.money(figures.totalPaid),
        paymentsCount: figures.paymentsCount,
        remaining: s.money(summary.remainingTotal),
      },
    };
  }

  async series(query: SeriesQuery): Promise<Series> {
    const s = await selected(query);
    // Courbe cumulée depuis le début des projets : versements antérieurs à `from` lus aussi, en point de départ du
    // cumul seulement (subscriberHistoryFigures, décision du 2026-11-10).
    const validated = await validatedOf(s, query.to === undefined ? {} : { to: query.to });
    const figures = subscriberHistoryFigures(
      validated,
      commitments(s.entries),
      query.from === undefined ? {} : { from: query.from },
    );
    return {
      cumulative: figures.cumulative.map((c) => ({ month: c.month, paid: s.money(c.paid) })),
      target: figures.target === null ? null : s.money(figures.target),
      byMonth: figures.byMonth.map((m) => ({
        month: m.month,
        projects: m.projects.map((p) => ({ projectId: p.projectId, paid: s.money(p.paid) })),
      })),
    };
  }
}
