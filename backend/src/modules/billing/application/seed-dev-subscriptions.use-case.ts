import { Inject, Injectable } from '@nestjs/common';
import { subscriptions } from '@cotiz/db';
import { CONFIG, type Config } from '../../../config.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { assertDevSeedAllowed, mockId } from '../../../shared/dev-seed/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

/**
 * Abonnements des associations de référence (docs/specs/seed-reference.yaml), comme les données simulées du front
 * (frontend/server/mocks/db/seed.ts) : Entraide en Essentiel (3 comptes gestionnaires accordés), Man en Pro en retard
 * de paiement, Bouaké en essai Découverte.
 */
const REFERENCE_SUBSCRIPTIONS = [
  {
    key: 'entraide',
    association: 'entraide-yopougon',
    plan: 'essentiel',
    status: 'active',
    start: '2026-09-01',
    end: '2026-09-30',
    managerSeatsOverride: 3,
  },
  {
    key: 'man',
    association: 'ressortissants-man',
    plan: 'pro',
    status: 'past_due',
    start: '2026-09-01',
    end: '2026-09-30',
    managerSeatsOverride: null,
  },
  {
    key: 'bouake',
    association: 'jeunesse-bouake',
    plan: 'decouverte',
    status: 'trialing',
    start: '2026-09-24',
    end: '2026-09-30',
    managerSeatsOverride: null,
  },
] as const;

/**
 * CLI `seed-dev` (lot 1.2) : abonnements de référence, après les plans et les associations. Lignes de plusieurs
 * associations : espace platform, connexion plateforme. Idempotente : une association qui a déjà un abonnement en cours
 * (ou cet abonnement) n'est pas modifiée. Refusée hors développement et test, et sans COTIZ_DEV_SEED=1.
 */
@Injectable()
export class SeedDevSubscriptionsUseCase {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  @Audited('subscription.seed_dev')
  async execute(): Promise<void> {
    assertDevSeedAllowed(this.config);
    for (const s of REFERENCE_SUBSCRIPTIONS) {
      const id = mockId('subscription', s.key);
      const associationId = mockId('association', s.association);
      // Sans cible : couvre aussi l'index partiel subscriptions_one_active (un seul abonnement en cours).
      const created = await currentTx()
        .insert(subscriptions)
        .values({
          id,
          associationId,
          planId: mockId('plan', s.plan),
          billingPeriod: 'monthly',
          status: s.status,
          currentPeriodStart: s.start,
          currentPeriodEnd: s.end,
          managerSeatsOverride: s.managerSeatsOverride,
        })
        .onConflictDoNothing()
        .returning({ id: subscriptions.id });
      recordAudit({
        entityType: 'subscription',
        entityId: id,
        associationId,
        after: { plan: s.plan, status: s.status, seed: 'dev', created: created.length > 0 },
      });
    }
  }
}
