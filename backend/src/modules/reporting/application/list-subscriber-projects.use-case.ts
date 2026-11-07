import { Injectable } from '@nestjs/common';
import { ENDPOINTS, type Installment } from '@cotiz/contracts';
import type { z } from 'zod';
import { installmentView, subscriberEnrollmentsOf } from '../../members/members.public.js';
import { sortedCards } from './subscriber-cards.js';

type Projects = z.infer<(typeof ENDPOINTS)['me.projects']['operations']['list']['response']['body']>;

/** Échéance encore à régler : ni payée, ni dispensée, ni annulée, avec un reste dû (domain-rules § 3). */
const CLOSED: ReadonlySet<Installment['status']> = new Set(['paid', 'waived', 'canceled']);

/**
 * me.projects : projets du souscripteur connecté, toutes associations (cartes du tableau de bord, même ordre), avec
 * les échéances ouvertes de chacun (sélecteur de la déclaration, lot 3.3) dans l'ordre de la grille.
 */
@Injectable()
export class ListSubscriberProjectsUseCase {
  async execute(): Promise<Projects> {
    const entries = sortedCards(await subscriberEnrollmentsOf());
    return {
      items: entries.map(({ entry, card }) => ({
        ...card,
        openInstallments: entry.lines
          .map((line) => installmentView(line, entry.project, entry.today))
          .filter((i) => !CLOSED.has(i.status) && i.remaining.amount > 0),
      })),
    };
  }
}
