import { Injectable } from '@nestjs/common';
import type { CreateEnrollmentInput, EnrollmentCreated } from '@cotiz/contracts';
import { enrollments, installments, subscriberProfiles } from '@cotiz/db';
import { installmentStatus, type IsoDate, lateSince, newId, todayIn } from '@cotiz/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { admitSubscriber, platformRoleOf, subscriberMembershipOf } from '../../access/access.public.js';
import { QuotaService } from '../../billing/billing.public.js';
import { accountByPhone, SubscriberAccounts, type SubscriberContact } from '../../identity/identity.public.js';
import { enrollmentScheduleOf, type ProjectRecord, projectOf } from '../../projects/projects.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { normalizePhone } from '../domain/phone.js';
import { enrollmentOf, type EnrollmentRecord, profileCreatorOf } from './enrollment-records.js';
import { toEnrollment } from './enrollment-views.js';
import { contextAssociationId } from './member-context.js';

type Input = z.infer<typeof CreateEnrollmentInput>;
type Result = z.infer<typeof EnrollmentCreated>;

/** Projet ouvert aux inscriptions (défaut retenu du lot 2.3) ; sinon `invalid_state`. */
const OPEN = new Set<ProjectRecord['status']>(['enrolling', 'active']);
/** Comptes qui ne peuvent plus être inscrits (Q8). */
const CLOSED_ACCOUNTS = new Set<SubscriberContact['status']>(['disabled', 'anonymized']);

/**
 * en.create (architecture/04 § 4.3), en une transaction :
 * 1. projet de l'association, verrouillé FOR SHARE (ni modification ni clôture pendant l'inscription, Q2), ouvert aux
 *    inscriptions ; date d'entrée (par défaut aujourd'hui, jamais avant le début du projet) et échéancier par
 *    generateSchedule() ;
 * 2. compte : retrouvé par son identifiant (mb.lookup) ou par son téléphone sous verrou (le même numéro ne crée jamais
 *    deux comptes), sinon créé en attente d'activation ;
 * 3. une inscription par projet et par personne, sous verrou (`already_enrolled`, même retirée) ;
 * 4. appartenance souscripteur créée ou rétablie (active dès l'inscription), sous le quota du plan ;
 * 5. inscription et échéances, statut initial par installmentStatus() (rattrapage : passées dues ou en retard, Q3) ;
 * 6. compte non activé créé par cette association : son code d'activation et le message prêt (Q8). Créé ailleurs
 *    (autre association, plateforme) : aucun code, la personne s'active avec celui d'origine ; un code émis ici
 *    fixerait le mot de passe d'un compte qui sert aussi ailleurs (prise de contrôle). `member.enrolled`, audit.
 * Comptes refusés (`invalid_state`) : désactivés, anonymisés, et le personnel de la plateforme.
 */
@Injectable()
export class CreateEnrollmentUseCase {
  constructor(
    private readonly accounts: SubscriberAccounts,
    private readonly quotas: QuotaService,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('enrollment.create')
  async execute(aid: string, projectId: string, input: Input): Promise<Result> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    const project = await projectOf(associationId, projectId, { lock: 'share' });
    if (!project) throw new DomainProblem('not_found');
    if (!OPEN.has(project.status)) throw new DomainProblem('invalid_state');

    const today = await this.todayOf(aid);
    const startsFrom = input.startsFrom ?? (today > project.startDate ? today : project.startDate);
    if (startsFrom < project.startDate) {
      throw new DomainProblem('validation_failed', { fields: { startsFrom: 'before_project_start' } });
    }
    const lines = enrollmentScheduleOf(project, startsFrom);
    if (!Array.isArray(lines)) throw new DomainProblem('validation_failed', { fields: lines });
    if (lines.length === 0) throw new DomainProblem('validation_failed', { fields: { startsFrom: 'no_installment' } });

    const { member, isNewAccount } = await this.accountFor(input);
    if (CLOSED_ACCOUNTS.has(member.status) || (await platformRoleOf(member.id)) !== null) {
      throw new DomainProblem('invalid_state');
    }

    const tx = currentTx();
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`enrollments:${projectId}:${member.id}`}, 0))`,
    );
    if (await enrollmentOf(projectId, member.id)) throw new DomainProblem('already_enrolled');

    const membership = await subscriberMembershipOf(associationId, member.id);
    if (membership === null || membership === 'removed') {
      await this.quotas.assert(associationId, 'subscribers');
      await admitSubscriber(associationId, member.id, actor.userId);
    }
    if (isNewAccount) {
      await tx.insert(subscriberProfiles).values({
        userId: member.id,
        address: 'address' in input ? (input.address ?? null) : null,
        createdByAssociationId: associationId,
      });
    }

    const enrollmentId = newId();
    const [row] = await tx
      .insert(enrollments)
      .values({
        id: enrollmentId,
        associationId,
        projectId,
        userId: member.id,
        // Contrat à signer d'abord (pending_signature) : lot 4.1.
        status: 'active',
        startsFrom,
        joinedAt: sql`now()`,
        activatedAt: sql`now()`,
      })
      .returning();
    if (!row) throw new Error('en.create : inscription non écrite');
    await tx.insert(installments).values(
      lines.map((line) => {
        const status = installmentStatus(
          { dueDate: line.dueDate, amountDue: line.amountDue, amountPaid: 0, amountPending: 0, status: 'upcoming' },
          today,
          project.graceDays,
        );
        return {
          id: newId(),
          associationId,
          projectId,
          enrollmentId,
          userId: member.id,
          kind: line.kind,
          sequence: line.sequence,
          dueDate: line.dueDate,
          amountDue: BigInt(line.amountDue),
          status,
          lateSince: status === 'late' ? lateSince(line, project.graceDays) : null,
        };
      }),
    );

    const createdHere = isNewAccount || (await profileCreatorOf(member.id)) === associationId;
    const handoff =
      member.status === 'pending_activation' && createdHere
        ? await this.accounts.issueActivation(member.id, associationId, actor.userId)
        : null;
    await this.outbox.publish(tx, {
      type: 'member.enrolled',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'enrollment', id: enrollmentId },
      payload: { enrollmentId, projectId, userId: member.id, isNewAccount },
    });
    recordAudit({
      entityType: 'enrollment',
      entityId: enrollmentId,
      after: {
        projectId,
        userId: member.id,
        isNewAccount,
        startsFrom,
        installments: lines.length,
        membership: membership === null ? 'created' : membership === 'removed' ? 'restored' : 'kept',
        // Jamais de clé « code » : l'audit la masquerait.
        account: handoff ? 'activation_code_issued' : member.status,
      },
    });
    return { enrollment: await toEnrollment(row, project, member, today), handoff };
  }

  /**
   * Rejeu de la même requête (même Idempotency-Key, en.create déjà réussie) : même réponse, reconstruite depuis la base,
   * le code d'activation déchiffré tant qu'il sert encore. Rien n'est réécrit, rien n'est audité.
   */
  async replay(aid: string, projectId: string, reference: { enrollmentId: string }): Promise<Result> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    const project = await projectOf(associationId, projectId);
    const row = project ? await this.enrollment(reference.enrollmentId, projectId) : null;
    const member = row ? await this.accounts.contactOf(row.userId) : null;
    if (!project || !row || !member) throw new DomainProblem('not_found');
    const handoff = await this.accounts.reissuedHandoff(member.id, associationId, actor.userId, row.createdAt);
    return { enrollment: await toEnrollment(row, project, member, await this.todayOf(aid)), handoff };
  }

  /** Compte inscrit : par son identifiant, ou par son téléphone (sous verrou), créé s'il n'existe pas. */
  private async accountFor(input: Input): Promise<{ member: SubscriberContact; isNewAccount: boolean }> {
    if ('userId' in input) {
      const member = await this.accounts.contactOf(input.userId);
      if (!member) throw new DomainProblem('not_found');
      return { member, isNewAccount: false };
    }
    const phone = normalizePhone(input.phone);
    if (!phone) throw new DomainProblem('invalid_phone', { fields: { phone: 'invalid_phone' } });
    await this.accounts.lockPhone(phone);
    const existing = await accountByPhone(phone);
    const userId =
      existing?.id ??
      (await this.accounts.create({
        phone,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
      }));
    const member = await this.accounts.contactOf(userId);
    if (!member) throw new Error('en.create : compte introuvable après création');
    return { member, isNewAccount: !existing };
  }

  private async enrollment(enrollmentId: string, projectId: string): Promise<EnrollmentRecord | null> {
    const [row] = await currentTx()
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.projectId, projectId)));
    return row ?? null;
  }

  /** Aujourd'hui dans le fuseau de l'association (domain-rules § 6). */
  private async todayOf(aid: string): Promise<IsoDate> {
    const association = await ownAssociationOf(aid);
    if (!association) throw new DomainProblem('not_found');
    return todayIn(association.timezone);
  }
}
