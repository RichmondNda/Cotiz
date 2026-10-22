import { Inject, Injectable } from '@nestjs/common';
import { associationPaymentMethods, associations } from '@cotiz/db';
import { CONFIG, type Config } from '../../../config.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { assertDevSeedAllowed, mockId } from '../../../shared/dev-seed/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

/**
 * Associations de docs/specs/seed-reference.yaml, complétées comme les données simulées du front
 * (frontend/server/mocks/db/seed.ts) : même identifiant (`uid('association', slug)`), statut, contacts, moyens de
 * paiement d'Entraide Yopougon.
 */
const REFERENCE_ASSOCIATIONS = [
  {
    slug: 'entraide-yopougon',
    name: 'Entraide Yopougon',
    city: 'Abidjan',
    status: 'active',
    description: 'Entraide entre familles du quartier de Yopougon.',
    contactEmail: 'awa@entraide.ci',
    contactPhone: '+2250708091011',
    createdAt: '2024-02-03',
    onboardingCompletedAt: '2024-02-03',
    paymentMethods: [
      {
        kind: 'mobile_money',
        label: 'Orange Money',
        details: { operator: 'orange', number: '+2250708091011' },
        instructions: null,
      },
      {
        kind: 'bank_transfer',
        label: 'SGBCI',
        details: { bank: 'SGBCI', iban: 'CI93 CI00 8011 1234 5678 9012 34' },
        instructions: 'Indiquez votre nom et « Centre » en référence du virement.',
      },
    ],
  },
  {
    slug: 'ressortissants-man',
    name: 'Association des ressortissants de Man',
    city: 'Abidjan',
    status: 'past_due',
    description: null,
    contactEmail: 'contact@ressortissants-man.example',
    contactPhone: '+2250700000000',
    createdAt: '2025-01-14',
    onboardingCompletedAt: '2025-01-14',
    paymentMethods: [],
  },
  {
    slug: 'jeunesse-bouake',
    name: 'Jeunesse solidaire de Bouaké',
    city: 'Bouaké',
    status: 'onboarding',
    description: null,
    contactEmail: 'contact@jeunesse-bouake.example',
    contactPhone: '+2250700000001',
    createdAt: '2026-09-20',
    onboardingCompletedAt: null,
    paymentMethods: [],
  },
] as const;

/**
 * CLI `seed-dev` (lot 1.2) : associations de référence. Lignes de plusieurs associations : espace platform, connexion
 * plateforme. Idempotente : une association déjà présente (même identifiant ou même slug) n'est pas modifiée. Refusée
 * hors développement et test, et sans COTIZ_DEV_SEED=1.
 */
@Injectable()
export class SeedDevAssociationsUseCase {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  @Audited('association.seed_dev')
  async execute(): Promise<string[]> {
    assertDevSeedAllowed(this.config);
    for (const a of REFERENCE_ASSOCIATIONS) {
      const id = mockId('association', a.slug);
      const created = await currentTx()
        .insert(associations)
        .values({
          id,
          slug: a.slug,
          name: a.name,
          type: 'association',
          city: a.city,
          country: 'Côte d’Ivoire',
          description: a.description,
          contactEmail: a.contactEmail,
          contactPhone: a.contactPhone,
          status: a.status,
          createdAt: new Date(`${a.createdAt}T09:00:00Z`),
          onboardingCompletedAt: a.onboardingCompletedAt ? new Date(`${a.onboardingCompletedAt}T09:00:00Z`) : null,
        })
        .onConflictDoNothing()
        .returning({ id: associations.id });
      if (created.length > 0) {
        for (const [position, m] of a.paymentMethods.entries()) {
          await currentTx()
            .insert(associationPaymentMethods)
            .values({
              id: mockId('payment-method', `${a.slug.split('-')[0] ?? a.slug}-${String(position)}`),
              associationId: id,
              kind: m.kind,
              label: m.label,
              details: m.details,
              instructions: m.instructions,
              position,
            })
            .onConflictDoNothing();
        }
      }
      recordAudit({
        entityType: 'association',
        entityId: id,
        associationId: id,
        after: { slug: a.slug, seed: 'dev', created: created.length > 0 },
      });
    }
    return REFERENCE_ASSOCIATIONS.map((a) => a.slug);
  }
}
