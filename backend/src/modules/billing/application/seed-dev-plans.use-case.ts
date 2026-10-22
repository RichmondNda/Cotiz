import { Inject, Injectable } from '@nestjs/common';
import { plans } from '@cotiz/db';
import { CONFIG, type Config } from '../../../config.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { assertDevSeedAllowed, mockId } from '../../../shared/dev-seed/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { publishPlanUpdated } from './plan-events.js';

/**
 * Plans de docs/specs/seed-reference.yaml, complétés comme les données simulées du front (frontend/server/mocks/db/
 * seed.ts) : annuel = 12 × mensuel (écrit tel quel), Essentiel mis en avant, fonctionnalités soumises au plan seulement (choix Q5 du
 * lot 1.2). Aucun plan en production : le super-admin les crée.
 */
const REFERENCE_PLANS = [
  {
    code: 'decouverte',
    name: 'Découverte',
    description: null,
    priceMonthly: 0,
    priceYearly: 0,
    limits: { projects: 1, subscribers: 20, managers: 1 },
    features: [],
    isFeatured: false,
  },
  {
    code: 'essentiel',
    name: 'Essentiel',
    description: 'Pour les associations qui gèrent plusieurs projets.',
    priceMonthly: 10000,
    priceYearly: 120000,
    limits: { projects: 5, subscribers: 100, managers: 2 },
    features: ['contracts', 'auto_reminders'],
    isFeatured: true,
  },
  {
    code: 'pro',
    name: 'Pro',
    description: null,
    priceMonthly: 25000,
    priceYearly: 300000,
    limits: { projects: null, subscribers: 500, managers: 5 },
    features: ['contracts', 'auto_reminders', 'imports', 'analytics'],
    isFeatured: false,
  },
] as const;

/**
 * CLI `seed-dev` (lot 1.2) : plans de référence, au même identifiant que les données simulées. Seul cotiz_platform
 * écrit les plans : à lancer dans l'espace platform, connexion plateforme. Idempotente : un plan déjà présent (même
 * identifiant ou même code) n'est pas modifié. Refusée hors développement et test, et sans COTIZ_DEV_SEED=1.
 */
@Injectable()
export class SeedDevPlansUseCase {
  constructor(
    private readonly outbox: OutboxService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Audited('plan.seed_dev')
  async execute(): Promise<string[]> {
    assertDevSeedAllowed(this.config);
    for (const plan of REFERENCE_PLANS) {
      const id = mockId('plan', plan.code);
      const created = await currentTx()
        .insert(plans)
        .values({
          id,
          code: plan.code,
          name: plan.name,
          description: plan.description,
          priceMonthly: BigInt(plan.priceMonthly),
          priceYearly: BigInt(plan.priceYearly),
          currency: 'XOF',
          maxProjects: plan.limits.projects,
          maxSubscribers: plan.limits.subscribers,
          maxManagers: plan.limits.managers,
          features: [...plan.features],
          isFeatured: plan.isFeatured,
          isActive: true,
        })
        .onConflictDoNothing()
        .returning({ id: plans.id });
      if (created.length > 0) await publishPlanUpdated(this.outbox, id, null);
      recordAudit({
        entityType: 'plan',
        entityId: id,
        associationId: null,
        after: { code: plan.code, seed: 'dev', created: created.length > 0 },
      });
    }
    return REFERENCE_PLANS.map((p) => p.code);
  }
}
