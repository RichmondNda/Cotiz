import { Inject, Injectable } from '@nestjs/common';
import type { Handoff } from '@cotiz/contracts';
import { enrollments, installments, subscriberProfiles, users } from '@cotiz/db';
import { installmentStatus, lateSince, todayIn } from '@cotiz/domain';
import { eq } from 'drizzle-orm';
import { subscriberMembershipOf } from '../../access/access.public.js';
import { SubscriberAccounts } from '../../identity/identity.public.js';
import { enrollmentScheduleOf, projectOf } from '../../projects/projects.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { CONFIG, type Config } from '../../../config.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { assertDevSeedAllowed, mockId, REFERENCE_CROWD } from '../../../shared/dev-seed/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

interface ReferenceEnrollment {
  project: string;
  user: string;
  joined: string;
  /** Date d'entrée, si elle n'est pas le début du projet. */
  startsFrom?: string;
  /** Contrat à signer : en attente de signature, sans échéancier (décision 20 : généré à la signature). */
  pendingSignature?: true;
}

/**
 * Inscriptions de docs/specs/seed-reference.yaml, comme les données simulées du front (frontend/server/mocks/db/seed.ts,
 * `ENROLLMENTS`), pour les comptes réels de seed-dev seulement : même identifiant (`uid('enrollment', 'projet:personne')`,
 * échéances `uid('installment', 'projet:personne:rang')`), échéancier par generateSchedule(). Sans paiement (lot 2.4) ;
 * en cours, sauf Moussa sur Voyage solidaire (« Contrat Voyage solidaire à signer », seed-reference.yaml) : en attente
 * de signature, sans échéancier (lot 3.2, comme les mocks).
 */
const REFERENCE_ENROLLMENTS: Readonly<Record<string, readonly ReferenceEnrollment[]>> = {
  'entraide-yopougon': [
    { project: 'centre-communautaire', user: 'moussa-diarra', joined: '2026-03-12' },
    { project: 'centre-communautaire', user: 'jean-kouassi', joined: '2026-03-12' },
    { project: 'centre-communautaire', user: 'fatou-traore', joined: '2026-09-02', startsFrom: '2026-09-02' },
    { project: 'centre-communautaire', user: 'awa-kone', joined: '2026-03-12' },
    {
      project: 'voyage-solidaire',
      user: 'moussa-diarra',
      joined: '2026-09-18',
      startsFrom: '2026-09-18',
      pendingSignature: true,
    },
    { project: 'voyage-solidaire', user: 'ibrahim-toure', joined: '2026-09-15', startsFrom: '2026-09-15' },
  ],
  'ressortissants-man': [{ project: 'mutuelle-sante', user: 'moussa-diarra', joined: '2026-07-01' }],
};

/** Comptes créés par l'association (« Codes à remettre », fiche modifiable) : Fatou, compte non activé. */
const CREATED_BY: Readonly<Record<string, string>> = { 'fatou-traore': 'entraide-yopougon' };

const at = (day: string) => new Date(`${day}T09:00:00Z`);

/**
 * CLI `seed-dev` (lot 2.3) : inscriptions de référence d'une association, dans son contexte. Idempotente : une
 * inscription déjà présente n'est pas modifiée ; un compte de référence absent (ou sans appartenance souscripteur) est
 * ignoré. Un compte non activé créé par l'association reçoit un nouveau code d'activation de l'association (« Codes à
 * remettre ») : son message prêt est renvoyé. Refusée hors développement et test, et sans COTIZ_DEV_SEED=1.
 */
@Injectable()
export class SeedDevMembersUseCase {
  constructor(
    private readonly accounts: SubscriberAccounts,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Audited('enrollment.seed_dev')
  async execute(slug: string): Promise<{ enrolled: string[]; crowd: number; codes: Handoff[] }> {
    assertDevSeedAllowed(this.config);
    const associationId = mockId('association', slug);
    const association = await ownAssociationOf(associationId);
    if (!association) throw new Error(`seed-dev : association ${slug} absente`);
    const today = todayIn(association.timezone);
    const tx = currentTx();
    const enrolled: string[] = [];
    const codes: Handoff[] = [];
    const creator = mockId('user', 'awa-kone');
    let crowd = 0;
    // Souscripteurs de démonstration (shared/dev-seed/reference-crowd.ts) après les inscriptions nommées : comptés
    // à part, jamais listés.
    const references: (ReferenceEnrollment & { crowd?: true })[] = [
      ...(REFERENCE_ENROLLMENTS[slug] ?? []),
      ...REFERENCE_CROWD.filter((p) => p.association === slug).map((p) => ({
        project: p.project,
        user: p.key,
        joined: p.joined,
        crowd: true as const,
      })),
    ];
    for (const e of references) {
      const userId = mockId('user', e.user);
      const [account] = await tx.select({ status: users.status }).from(users).where(eq(users.id, userId));
      const project = await projectOf(associationId, mockId('project', e.project), { lock: 'share' });
      const membership = await subscriberMembershipOf(associationId, userId);
      if (!account || !project || membership === null || membership === 'removed') continue;

      const createdHere = CREATED_BY[e.user] === slug;
      await tx
        .insert(subscriberProfiles)
        .values({ userId, createdByAssociationId: createdHere ? associationId : null })
        .onConflictDoNothing();
      const id = mockId('enrollment', `${e.project}:${e.user}`);
      const startsFrom = e.startsFrom ?? project.startDate;
      const created = await tx
        .insert(enrollments)
        .values({
          id,
          associationId,
          projectId: project.id,
          userId,
          status: e.pendingSignature ? 'pending_signature' : 'active',
          startsFrom,
          joinedAt: at(e.joined),
          activatedAt: e.pendingSignature ? null : at(e.joined),
        })
        .onConflictDoNothing()
        .returning({ id: enrollments.id });
      if (created.length > 0 && !e.pendingSignature) {
        const lines = enrollmentScheduleOf(project, startsFrom);
        if (!Array.isArray(lines)) throw new Error(`seed-dev : échéancier refusé pour ${e.project}:${e.user}`);
        await tx.insert(installments).values(
          lines.map((line) => {
            const status = installmentStatus(
              {
                dueDate: line.dueDate,
                lateFrom: null,
                amountDue: line.amountDue,
                amountPaid: 0,
                amountPending: 0,
                status: 'upcoming',
              },
              today,
              project.graceDays,
            );
            return {
              id: mockId('installment', `${e.project}:${e.user}:${String(line.sequence)}`),
              associationId,
              projectId: project.id,
              enrollmentId: id,
              userId,
              kind: line.kind,
              sequence: line.sequence,
              dueDate: line.dueDate,
              amountDue: BigInt(line.amountDue),
              status,
              lateSince: status === 'late' ? lateSince(line, project.graceDays) : null,
            };
          }),
        );
      }
      if (createdHere && account.status === 'pending_activation' && !codes.some((c) => c.recipient.id === userId)) {
        codes.push((await this.accounts.issueActivation(userId, associationId, creator)).handoff);
      }
      if (e.crowd) crowd += 1;
      else enrolled.push(`${e.project}:${e.user}`);
      recordAudit({
        entityType: 'enrollment',
        entityId: id,
        associationId,
        after: { seed: 'dev', created: created.length > 0 },
      });
    }
    return { enrolled, crowd, codes };
  }
}

/** Associations dont seed-dev pose des inscriptions de référence. */
export const REFERENCE_MEMBER_ASSOCIATIONS = Object.keys(REFERENCE_ENROLLMENTS);
