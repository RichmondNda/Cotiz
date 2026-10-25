import { Inject, Injectable } from '@nestjs/common';
import { associationPaymentMethods, projectPaymentMethods, projects } from '@cotiz/db';
import { and, eq, inArray } from 'drizzle-orm';
import { CONFIG, type Config } from '../../../config.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { assertDevSeedAllowed, mockId } from '../../../shared/dev-seed/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

type Status = 'enrolling' | 'active';

interface ReferenceProject {
  key: string;
  name: string;
  description: string;
  status: Status;
  scheduleType: 'fixed' | 'rolling';
  entryFee: number | null;
  installmentAmount: number;
  startDate: string;
  endDate: string | null;
  requiredSubscribers: number | null;
  createdAt: string;
  lockedAt: string | null;
  /** Moyens retenus : clé `uid('payment-method', …)` des moyens de SeedDevAssociationsUseCase, consigne propre. */
  paymentMethods: readonly { key: string; instructions: string | null }[];
}

const CENTRE = 'Indiquez votre nom et « Centre » en référence du virement.';

/**
 * Projets de docs/specs/seed-reference.yaml, comme les données simulées du front (frontend/server/mocks/db/seed.ts,
 * `projects()`) : même identifiant (`uid('project', clé)`), statut, conditions, verrouillage. Mensuels, le 5, 5 jours
 * de grâce. Sans couverture (aucun fichier de développement) ni contrat (lot 4.1). Mutuelle santé n'a pas de moyen
 * propre : ceux de l'association (aucun en développement).
 */
const REFERENCE_PROJECTS: Readonly<Record<string, readonly ReferenceProject[]>> = {
  'entraide-yopougon': [
    {
      key: 'centre-communautaire',
      name: 'Centre communautaire',
      description: 'Construction d’un centre communautaire pour les familles du quartier.',
      status: 'active',
      scheduleType: 'fixed',
      entryFee: 50000,
      installmentAmount: 25000,
      startDate: '2026-03-01',
      endDate: '2027-08-31',
      requiredSubscribers: 60,
      createdAt: '2026-03-01',
      lockedAt: '2026-03-06',
      paymentMethods: [
        { key: 'entraide-1', instructions: CENTRE },
        { key: 'entraide-0', instructions: CENTRE },
      ],
    },
    {
      key: 'tontine-2027',
      name: 'Tontine solidaire 2027',
      description: '',
      status: 'enrolling',
      scheduleType: 'rolling',
      entryFee: null,
      installmentAmount: 10000,
      startDate: '2027-01-01',
      endDate: null,
      requiredSubscribers: 30,
      createdAt: '2026-09-01',
      lockedAt: null,
      paymentMethods: [{ key: 'entraide-0', instructions: null }],
    },
    {
      key: 'voyage-solidaire',
      name: 'Voyage solidaire',
      description: '',
      status: 'active',
      scheduleType: 'fixed',
      entryFee: 50000,
      installmentAmount: 10000,
      startDate: '2026-06-01',
      endDate: '2027-05-31',
      requiredSubscribers: null,
      createdAt: '2026-05-20',
      lockedAt: '2026-06-06',
      paymentMethods: [
        { key: 'entraide-0', instructions: null },
        { key: 'entraide-1', instructions: null },
      ],
    },
  ],
  'ressortissants-man': [
    {
      key: 'mutuelle-sante',
      name: 'Mutuelle santé',
      description: '',
      status: 'active',
      scheduleType: 'fixed',
      entryFee: 20000,
      installmentAmount: 10000,
      startDate: '2026-07-01',
      endDate: '2027-04-30',
      requiredSubscribers: null,
      createdAt: '2026-06-15',
      lockedAt: '2026-07-06',
      paymentMethods: [],
    },
  ],
};

/** Associations qui ont des projets de référence, à passer une par une à SeedDevProjectsUseCase. */
export const REFERENCE_PROJECT_ASSOCIATIONS = Object.keys(REFERENCE_PROJECTS);

/** Créateur des projets de référence : la trésorière d'Entraide Yopougon, sinon le super-admin des maquettes. */
const creatorOf = (slug: string) => mockId('user', slug === 'entraide-yopougon' ? 'awa-kone' : 'richy');

const at = (day: string) => new Date(`${day}T09:00:00Z`);

/**
 * CLI `seed-dev` (lot 2.2) : projets de référence d'une association, dans son contexte (espace association, association
 * posée : projets et moyens retenus sous leur politique d'isolation). Lancée après les associations. Idempotente : un
 * projet déjà présent n'est pas modifié. Refusée hors développement et test, et sans COTIZ_DEV_SEED=1.
 */
@Injectable()
export class SeedDevProjectsUseCase {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  @Audited('project.seed_dev')
  async execute(slug: string): Promise<string[]> {
    assertDevSeedAllowed(this.config);
    const associationId = mockId('association', slug);
    const reference = REFERENCE_PROJECTS[slug] ?? [];
    for (const p of reference) {
      const id = mockId('project', p.key);
      const created = await currentTx()
        .insert(projects)
        .values({
          id,
          associationId,
          name: p.name,
          description: p.description,
          status: p.status,
          requiredSubscribers: p.requiredSubscribers,
          entryFeeAmount: p.entryFee === null ? null : BigInt(p.entryFee),
          installmentAmount: BigInt(p.installmentAmount),
          frequency: 'monthly',
          dueDay: 5,
          scheduleType: p.scheduleType,
          startDate: p.startDate,
          endDate: p.endDate,
          graceDays: 5,
          currency: 'XOF',
          financialTermsLockedAt: p.lockedAt === null ? null : at(p.lockedAt),
          createdBy: creatorOf(slug),
          createdAt: at(p.createdAt),
        })
        .onConflictDoNothing()
        .returning({ id: projects.id });
      // Moyens de référence encore présents et actifs (une base de développement a pu les remplacer par as.pm) ;
      // aucun : liste vide, soit les moyens de l'association.
      const wanted = p.paymentMethods.map((m) => ({ ...m, id: mockId('payment-method', m.key) }));
      const present =
        wanted.length === 0
          ? new Set<string>()
          : new Set(
              (
                await currentTx()
                  .select({ id: associationPaymentMethods.id })
                  .from(associationPaymentMethods)
                  .where(
                    and(
                      inArray(
                        associationPaymentMethods.id,
                        wanted.map((m) => m.id),
                      ),
                      eq(associationPaymentMethods.isActive, true),
                    ),
                  )
              ).map((r) => r.id),
            );
      const methods = wanted.filter((m) => present.has(m.id));
      if (created.length > 0 && methods.length > 0) {
        await currentTx()
          .insert(projectPaymentMethods)
          .values(
            methods.map((m) => ({
              projectId: id,
              paymentMethodId: m.id,
              associationId,
              instructionsOverride: m.instructions,
            })),
          )
          .onConflictDoNothing();
      }
      recordAudit({
        entityType: 'project',
        entityId: id,
        associationId,
        after: { key: p.key, seed: 'dev', created: created.length > 0 },
      });
    }
    return reference.map((p) => p.key);
  }
}
