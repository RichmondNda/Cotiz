import { Inject, Injectable } from '@nestjs/common';
import { allocations, associationPaymentMethods, enrollments, installments, payments } from '@cotiz/db';
import {
  type Currency,
  installmentStatus,
  lateSinceOf,
  type LedgerInstallment,
  Money,
  todayIn,
  validateAllocation,
} from '@cotiz/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { seedDevProof } from '../../files/files.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { CONFIG, type Config } from '../../../config.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { assertDevSeedAllowed, CROWD_REVIEWER, mockId, REFERENCE_CROWD } from '../../../shared/dev-seed/index.js';
import { StorageService } from '../../../shared/storage/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

interface ReferencePayment {
  key: string;
  project: string;
  user: string;
  amount: number;
  /** Heure d'Abidjan (UTC), comme les données simulées. */
  declared: string;
  method: 'mobile_money' | 'bank_transfer';
  /** [rang de l'échéance, montant]. */
  covers: readonly (readonly [number, number])[];
  /** Validé : relecteur et date ; sinon en attente. */
  reviewed?: { at: string; by: string };
  /** Preuve en fichier (nom d'origine) ; sinon la référence de transaction. */
  proofName?: string;
}

const REF = '[RÉFÉRENCE]';
const AMINATA = 'aminata-konate';
const RESPONSABLE_MAN = 'responsable-man';

/**
 * Historique validé du Centre communautaire (fonds d'entrée et mars, puis avril à juillet) : celui de Moussa dans les
 * données simulées, repris pour Jean et Awa, dont ces échéances y sont payées sans que leurs paiements soient listés.
 */
const history = (prefix: string, user: string): ReferencePayment[] => [
  {
    key: `${prefix}-03-c`,
    project: 'centre-communautaire',
    user,
    amount: 75000,
    declared: '2026-03-05T08:00',
    method: 'mobile_money',
    covers: [
      [0, 50000],
      [1, 25000],
    ],
    reviewed: { at: '2026-03-06T09:00', by: AMINATA },
  },
  ...(
    [
      ['04', 2, '2026-04-07T09:00'],
      ['05', 3, '2026-05-06T09:00'],
      ['06', 4, '2026-06-06T09:00'],
      ['07', 5, '2026-07-07T09:00'],
    ] as const
  ).map(([month, sequence, at]) => ({
    key: `${prefix}-${month}-c`,
    project: 'centre-communautaire',
    user,
    amount: 25000,
    declared: `2026-${month}-05T08:00`,
    method: 'mobile_money' as const,
    covers: [[sequence, 25000]] as const,
    reviewed: { at, by: AMINATA },
  })),
];

/**
 * Paiements de frontend/server/mocks/db/seed.ts (`PAYMENTS`, même identifiant `uid('payment', clé)`) des inscrits réels
 * de seed-dev, plus l'historique de Jean et d'Awa. Les autres personnes du jeu de référence n'existent pas en réel.
 */
const REFERENCE_PAYMENTS: Readonly<Record<string, readonly ReferencePayment[]>> = {
  'entraide-yopougon': [
    ...history('pm-md', 'moussa-diarra'),
    ...history('pm-jk', 'jean-kouassi'),
    ...history('pm-ak', 'awa-kone'),
    {
      key: 'pm-ak-08',
      project: 'centre-communautaire',
      user: 'awa-kone',
      amount: 25000,
      declared: '2026-08-05T09:00',
      method: 'mobile_money',
      covers: [[6, 25000]],
      reviewed: { at: '2026-08-05T15:00', by: AMINATA },
    },
    {
      key: 'pm-jk-09',
      project: 'centre-communautaire',
      user: 'jean-kouassi',
      amount: 37500,
      declared: '2026-09-06T09:00',
      method: 'mobile_money',
      covers: [
        [7, 25000],
        [6, 12500],
      ],
      reviewed: { at: '2026-09-06T15:00', by: AMINATA },
    },
    // File de validation.
    {
      key: 'pm-awa-kone',
      project: 'centre-communautaire',
      user: 'awa-kone',
      amount: 75000,
      declared: '2026-09-22T10:41',
      method: 'mobile_money',
      covers: [
        [7, 25000],
        [8, 25000],
        [9, 25000],
      ],
      proofName: 'capture_mobile_money.jpg',
    },
    {
      key: 'pm-jean-kouassi',
      project: 'centre-communautaire',
      user: 'jean-kouassi',
      amount: 12500,
      declared: '2026-09-23T08:15',
      method: 'mobile_money',
      covers: [[6, 12500]],
    },
    {
      key: 'pm-ibrahim-toure',
      project: 'voyage-solidaire',
      user: 'ibrahim-toure',
      amount: 10000,
      declared: '2026-09-24T18:05',
      method: 'mobile_money',
      covers: [[0, 10000]],
      proofName: '[FICHIER]',
    },
  ],
  'ressortissants-man': [
    {
      key: 'pm-md-07-m',
      project: 'mutuelle-sante',
      user: 'moussa-diarra',
      amount: 30000,
      declared: '2026-07-05T08:30',
      method: 'mobile_money',
      covers: [
        [0, 20000],
        [1, 10000],
      ],
      reviewed: { at: '2026-07-06T09:00', by: RESPONSABLE_MAN },
    },
    {
      key: 'pm-md-08-m',
      project: 'mutuelle-sante',
      user: 'moussa-diarra',
      amount: 10000,
      declared: '2026-08-05T08:00',
      method: 'mobile_money',
      covers: [[2, 10000]],
      reviewed: { at: '2026-08-06T09:00', by: RESPONSABLE_MAN },
    },
    {
      key: 'pm-md-09-m',
      project: 'mutuelle-sante',
      user: 'moussa-diarra',
      amount: 10000,
      declared: '2026-09-05T08:00',
      method: 'mobile_money',
      covers: [[3, 10000]],
      reviewed: { at: '2026-09-06T09:00', by: RESPONSABLE_MAN },
    },
  ],
};

/** Paiements des souscripteurs de démonstration (shared/dev-seed/reference-crowd.ts), relus par la trésorière. */
function crowdPayments(slug: string): ReferencePayment[] {
  return REFERENCE_CROWD.filter((person) => person.association === slug).flatMap((person) =>
    person.payments.map((p) => ({
      key: p.key,
      project: person.project,
      user: person.key,
      amount: p.amount,
      declared: p.declared,
      method: 'mobile_money' as const,
      covers: p.covers,
      ...(p.reviewedAt ? { reviewed: { at: p.reviewedAt, by: CROWD_REVIEWER } } : {}),
    })),
  );
}

const at = (time: string) => new Date(`${time}:00Z`);

/**
 * CLI `seed-dev` (lot 2.4) : paiements de référence d'une association, dans son contexte, pour tester grille et
 * validation avant l'espace souscripteur. Chaque répartition est contrôlée par validateAllocation() ; les échéances
 * reçoivent les montants payés (répartitions confirmées) ou en attente (proposées) et leur statut recalculé. Ni
 * événement ni notification : ce sont des paiements passés. Idempotente : un paiement déjà présent n'est pas repris ;
 * une inscription de référence absente est ignorée. Refusée hors développement et test, et sans COTIZ_DEV_SEED=1.
 */
@Injectable()
export class SeedDevPaymentsUseCase {
  constructor(
    private readonly storage: StorageService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Audited('payment.seed_dev')
  async execute(
    slug: string,
  ): Promise<{ pending: number; validated: number; crowd: { pending: number; validated: number } }> {
    assertDevSeedAllowed(this.config);
    const associationId = mockId('association', slug);
    const association = await ownAssociationOf(associationId);
    if (!association) throw new Error(`seed-dev : association ${slug} absente`);
    const today = todayIn(association.timezone);
    const tx = currentTx();
    const seeded = { pending: 0, validated: 0 };
    const crowd = { pending: 0, validated: 0 };
    const crowdKeys = new Set(crowdPayments(slug).map((p) => p.key));
    const references = [...(REFERENCE_PAYMENTS[slug] ?? []), ...crowdPayments(slug)];
    // Lus une fois pour toute l'exécution (des centaines de paiements) : inscriptions actives, paiements déjà présents,
    // projets. Les échéances, elles, sont relues sous verrou à chaque paiement (insert()).
    const enrollmentIds = [...new Set(references.map((p) => mockId('enrollment', `${p.project}:${p.user}`)))];
    const activeEnrollments = new Map(
      (
        await tx
          .select({ id: enrollments.id, projectId: enrollments.projectId })
          .from(enrollments)
          .where(and(inArray(enrollments.id, enrollmentIds), eq(enrollments.status, 'active')))
      ).map((e) => [e.id, e.projectId]),
    );
    const existingPayments = new Set(
      (
        await tx
          .select({ id: payments.id })
          .from(payments)
          .where(
            inArray(
              payments.id,
              references.map((p) => mockId('payment', p.key)),
            ),
          )
      ).map((row) => row.id),
    );
    const projectsById = new Map<string, Awaited<ReturnType<typeof projectOf>>>();
    for (const projectId of new Set(activeEnrollments.values())) {
      projectsById.set(projectId, await projectOf(associationId, projectId));
    }
    const methods = new Map<string, string | null>();
    for (const p of references) {
      const id = mockId('payment', p.key);
      const enrollmentId = mockId('enrollment', `${p.project}:${p.user}`);
      const userId = mockId('user', p.user);
      const projectId = activeEnrollments.get(enrollmentId);
      const project = projectId ? projectsById.get(projectId) : null;
      if (!projectId || !project) continue;
      const existing = existingPayments.has(id);
      if (!existing) await this.insert(p, { id, associationId, enrollmentId, userId, project, today, methods });
      (crowdKeys.has(p.key) ? crowd : seeded)[p.reviewed ? 'validated' : 'pending'] += 1;
      recordAudit({
        entityType: 'payment',
        entityId: id,
        associationId,
        after: { seed: 'dev', key: p.key, created: !existing },
      });
    }
    // Aucune inscription de référence présente : l'exécution est tout de même tracée.
    if (seeded.pending + seeded.validated + crowd.pending + crowd.validated === 0) {
      recordAudit({ entityType: 'association', entityId: associationId, associationId, after: { seed: 'dev' } });
    }
    return { ...seeded, crowd };
  }

  private async insert(
    p: ReferencePayment,
    ctx: {
      id: string;
      associationId: string;
      enrollmentId: string;
      userId: string;
      project: { id: string; currency: string; graceDays: number };
      today: string;
      /** Moyen de paiement actif retenu par type, lu une fois par exécution. */
      methods: Map<string, string | null>;
    },
  ): Promise<void> {
    const tx = currentTx();
    const currency = ctx.project.currency as Currency;
    const rows = await tx
      .select()
      .from(installments)
      .where(eq(installments.enrollmentId, ctx.enrollmentId))
      // Verrous dans l'ordre des identifiants, comme la validation (architecture/04 § 4.5).
      .orderBy(installments.id)
      .for('update');
    const ledger: LedgerInstallment[] = rows.map((r) => ({
      id: r.id,
      enrollmentId: r.enrollmentId,
      kind: r.kind,
      sequence: r.sequence,
      dueDate: r.dueDate,
      amountDue: Money.fromDb(r.amountDue, currency).amount,
      amountPaid: Money.fromDb(r.amountPaid, currency).amount,
      amountPending: Money.fromDb(r.amountPending, currency).amount,
      status: r.status,
    }));
    const split = p.covers.map(([sequence, amount]) => ({
      installmentId: mockId('installment', `${p.project}:${p.user}:${String(sequence)}`),
      amount,
    }));
    const check = validateAllocation(p.amount, split, ledger, { enrollmentId: ctx.enrollmentId });
    if (!check.ok) throw new Error(`seed-dev : répartition refusée pour ${p.key} (${check.errors[0]?.code ?? '?'})`);

    if (!ctx.methods.has(p.method)) {
      const [method] = await tx
        .select({ id: associationPaymentMethods.id })
        .from(associationPaymentMethods)
        .where(
          and(
            eq(associationPaymentMethods.associationId, ctx.associationId),
            eq(associationPaymentMethods.kind, p.method),
            eq(associationPaymentMethods.isActive, true),
          ),
        )
        .orderBy(associationPaymentMethods.position)
        .limit(1);
      ctx.methods.set(p.method, method?.id ?? null);
    }
    const methodId = ctx.methods.get(p.method) ?? null;
    const proofFileId = p.proofName ? mockId('file', p.key) : null;
    if (proofFileId && p.proofName) {
      await seedDevProof(this.storage, this.config, {
        id: proofFileId,
        associationId: ctx.associationId,
        ownerUserId: ctx.userId,
        originalName: p.proofName,
      });
    }
    const declaredAt = at(p.declared);
    const reviewedAt = p.reviewed ? at(p.reviewed.at) : null;
    await tx.insert(payments).values({
      id: ctx.id,
      associationId: ctx.associationId,
      projectId: ctx.project.id,
      enrollmentId: ctx.enrollmentId,
      userId: ctx.userId,
      amountDeclared: BigInt(p.amount),
      currency,
      paidOn: p.declared.slice(0, 10),
      paymentMethodId: methodId,
      transactionReference: proofFileId ? null : REF,
      proofFileId,
      status: p.reviewed ? 'validated' : 'pending',
      declaredAt,
      reviewedBy: p.reviewed ? mockId('user', p.reviewed.by) : null,
      reviewedAt,
      idempotencyKey: `seed-dev:${p.key}`,
      createdAt: declaredAt,
      updatedAt: reviewedAt ?? declaredAt,
    });
    await tx.insert(allocations).values(
      split.map((a) => ({
        id: mockId('allocation', `${p.key}:${a.installmentId}`),
        associationId: ctx.associationId,
        paymentId: ctx.id,
        installmentId: a.installmentId,
        enrollmentId: ctx.enrollmentId,
        amount: BigInt(a.amount),
        state: p.reviewed ? ('confirmed' as const) : ('proposed' as const),
      })),
    );
    for (const a of split) {
      const line = ledger.find((x) => x.id === a.installmentId);
      if (!line) throw new Error(`seed-dev : échéance absente pour ${p.key}`);
      const added = Money.of(a.amount, currency);
      const amountPaid = p.reviewed ? Money.add(Money.of(line.amountPaid, currency), added).amount : line.amountPaid;
      const amountPending = p.reviewed
        ? line.amountPending
        : Money.add(Money.of(line.amountPending, currency), added).amount;
      const status = installmentStatus({ ...line, amountPaid, amountPending }, ctx.today, ctx.project.graceDays);
      await tx
        .update(installments)
        .set({
          amountPaid: BigInt(amountPaid),
          amountPending: BigInt(amountPending),
          status,
          lateSince: lateSinceOf({ ...line, amountPaid, amountPending }, ctx.today, ctx.project.graceDays),
          paidAt: status === 'paid' ? reviewedAt : null,
        })
        .where(eq(installments.id, line.id));
    }
  }
}

/** Associations dont seed-dev pose des paiements de référence. */
export const REFERENCE_PAYMENT_ASSOCIATIONS = Object.keys(REFERENCE_PAYMENTS);
