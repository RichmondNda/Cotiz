import { Injectable } from '@nestjs/common';
import type { ENDPOINTS } from '@cotiz/contracts';
import { type Currency, type MemberStanding, Money, overallStanding, subscriberSummary } from '@cotiz/domain';
import type { z } from 'zod';
import { activeMembershipsOf } from '../../access/access.public.js';
import { subscriberEnrollmentsOf } from '../../members/members.public.js';
import {
  type SubscriberAssociationDetails,
  subscriberAssociationDetailsOf,
  subscriberPaymentMethodsOf,
  toPaymentMethod,
} from '../../tenancy/tenancy.public.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { sortedCards } from './subscriber-cards.js';

type Ops = (typeof ENDPOINTS)['me.assos']['operations'];
type List = z.infer<Ops['list']['response']['body']>;
type Detail = z.infer<Ops['get']['response']['body']>;
type Entry = ReturnType<typeof sortedCards>[number];

/** Devise d'une association sans inscription (XOF seulement, contrainte `associations_currency_xof`). */
const DEFAULT_CURRENCY: Currency = 'XOF';
/** Projet terminé ou archivé : n'est plus « en cours ». */
const ENDED_PROJECTS: ReadonlySet<string> = new Set(['completed', 'archived']);

/**
 * me.assos (lot 4.5) : associations où la personne connectée est souscriptrice active (mb-associations) et fiche de
 * l'une d'elles (mb-association-detail). Chiffres tirés des mêmes cartes que me.dash et me.projects (`sortedCards`) :
 * - reste dû : inscriptions qui engagent (`subscriberSummary`) ; projets en cours : inscriptions non retirées d'un
 *   projet ni terminé ni archivé ;
 * - situation : la plus grave de ses inscriptions, retirées comprises (`overallStanding`) ;
 * - liste : seulement les associations où la personne a un projet en cours ou un reste à régler (retours d'interface
 *   du 2026-11-12) ; la fiche d'une autre association où elle est souscriptrice reste servie ;
 * - fiche : cartes des inscriptions non retirées (comme me.projects) et moyens de paiement actifs de l'association.
 * Association non rejointe comme souscriptrice (autre association, rôle de gestion seul, appartenance retirée) : 404.
 */
@Injectable()
export class GetSubscriberAssociationsUseCase {
  async list(): Promise<List> {
    const joined = await this.joined();
    if (joined.length === 0) return { items: [] };
    const details = await subscriberAssociationDetailsOf(joined.map((m) => m.associationId));
    const entries = sortedCards(await subscriberEnrollmentsOf({ includeWithdrawn: true }));
    return {
      items: joined.flatMap(({ associationId, joinedAt }) => {
        const association = details.get(associationId);
        if (!association) return [];
        const own = entries.filter((e) => e.entry.association.id === associationId);
        const current = own.filter((e) => e.entry.row.status !== 'withdrawn');
        const summary = subscriberSummary(
          current.map(({ entry, card }) => ({
            status: entry.row.status,
            remaining: card.remaining.amount,
            late: null,
            nextDue: null,
          })),
        );
        const activeProjects = current.filter((e) => !ENDED_PROJECTS.has(e.entry.project.status)).length;
        // Rien en cours ni à régler (projets terminés et soldés, inscriptions retirées, aucune) : pas dans la liste.
        if (activeProjects === 0 && summary.remainingTotal === 0) return [];
        return [
          {
            association: { ...refOf(association), city: association.city },
            memberSince: joinedAt.toISOString(),
            activeProjects,
            remaining: Money.of(summary.remainingTotal, currencyOf(own)),
            standing: standingOf(own),
          },
        ];
      }),
    };
  }

  async get(aid: string): Promise<Detail> {
    const associationId = aid.toLowerCase();
    if (!(await this.joined()).some((m) => m.associationId === associationId)) throw new DomainProblem('not_found');
    const association = (await subscriberAssociationDetailsOf([associationId])).get(associationId);
    if (!association) throw new DomainProblem('not_found');
    const entries = sortedCards(await subscriberEnrollmentsOf()).filter(
      (e) => e.entry.association.id === associationId,
    );
    const methods = (await subscriberPaymentMethodsOf([associationId])).filter(
      (m) => m.associationId === associationId && m.isActive,
    );
    return {
      association: {
        ...refOf(association),
        city: association.city,
        country: association.country,
        description: association.description,
        contactEmail: association.contactEmail,
        contactPhone: association.contactPhone,
      },
      projects: entries.map((e) => e.card),
      paymentMethods: methods.map(toPaymentMethod),
    };
  }

  /** Appartenances souscriptrices actives de la personne connectée, dans l'ordre où elle les a rejointes. */
  private async joined(): Promise<{ associationId: string; joinedAt: Date }[]> {
    const { userId } = requireActor();
    return (await activeMembershipsOf(userId))
      .filter((m) => m.role === 'subscriber')
      .map((m) => ({ associationId: m.association.id, joinedAt: m.joinedAt }));
  }
}

function refOf(a: SubscriberAssociationDetails) {
  return { id: a.id, name: a.name, logoFileId: a.logoFileId, suspended: a.suspended };
}

function currencyOf(entries: readonly Entry[]): Currency {
  return entries[0]?.card.remaining.currency ?? DEFAULT_CURRENCY;
}

function standingOf(entries: readonly Entry[]): MemberStanding {
  return entries.length === 0 ? 'up_to_date' : overallStanding(entries.map((e) => e.card.standing));
}
