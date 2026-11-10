import { Injectable } from '@nestjs/common';
import type { DeclarePaymentInput, SubscriberPayment } from '@cotiz/contracts';
import { payments as t } from '@cotiz/db';
import {
  type Allocation,
  type Currency,
  DomainError,
  moveAllocations,
  newId,
  proposeAllocation,
  validateAllocation,
} from '@cotiz/domain';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { z } from 'zod';
import { subscriberProofOf } from '../../files/files.public.js';
import { type SubscriberEnrollment, subscriberEnrollmentsOf } from '../../members/members.public.js';
import { subscriberProjectLinksOf } from '../../projects/projects.public.js';
import { subscriberPaymentMethodsOf } from '../../tenancy/tenancy.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { allocationProblem } from '../domain/allocation-problem.js';
import {
  checkDeferred,
  declaredAllocationsOf,
  insertAllocations,
  lockInstallments,
  writePending,
} from './payment-review.js';
import { subscriberPaymentsOf } from './subscriber-payments.js';

type Input = z.infer<typeof DeclarePaymentInput>;

/** Projet terminé ou archivé : plus aucune déclaration (domain-rules § 8 : transition interdite → invalid_state). */
const CLOSED_PROJECTS = new Set(['completed', 'archived']);

/**
 * me.declare (architecture/04 § 4.4), en espace subscriber, une transaction :
 * 1. rejeu : un paiement de la personne porte déjà cette Idempotency-Key (réponse mémorisée expirée) → le même, sans
 *    rien réécrire ni auditer ; autre déclaration (projet, montant, date, moyen, référence, preuve, répartition) →
 *    `idempotency_key_reused` ;
 * 2. contrôles : inscription non retirée de la personne au projet (sinon 404), signée (`signature_required`), active et
 *    projet ouvert (`invalid_state`), devise, date du versement pas dans le futur (jour de l'association), moyen
 *    retenu par le projet et actif, preuve `clean` de la personne et pas déjà citée, ou référence (`proof_required`,
 *    `file_not_clean`, `file_scan_pending`, `proof_already_used`) ;
 * 3. paiement inséré **d'abord** : sa clé étrangère pose FOR KEY SHARE sur l'inscription (attend un en.withdraw en
 *    cours), puis échéances de l'inscription (et celles visées ailleurs) verrouillées par id et relues : même ordre
 *    inscription → échéances qu'en.withdraw, aucune attente sur le projet verrouillé par lg.pay.validate ; une
 *    déclaration concurrente sur les mêmes échéances attend et voit le reste réduit ;
 * 4. reste dû (`amount_exceeds_remaining`, trop-perçu refusé), `validateAllocation()`, répartition proposée, montants
 *    en attente par moveAllocations() et statuts (`declared`) par installmentStatus() (writePending : seules colonnes
 *    permises au souscripteur) ;
 * 5. audit `payment.declare`, événement `payment.declared` ; contrôles différés vérifiés ici.
 */
@Injectable()
export class DeclarePaymentUseCase {
  constructor(private readonly outbox: OutboxService) {}

  async execute(input: Input, idempotencyKey: string): Promise<SubscriberPayment> {
    const entry = await this.enrollmentOf(input.projectId);
    const replayed = await this.replayOf(entry, input, idempotencyKey);
    if (replayed) return replayed;
    return this.declare(entry, input, idempotencyKey);
  }

  @Audited('payment.declare')
  private async declare(entry: SubscriberEnrollment, input: Input, idempotencyKey: string) {
    const actor = requireActor();
    const associationId = entry.association.id;
    const currency = entry.project.currency as Currency;
    const amount = this.amountOf(input.amount, currency, 'amount');
    const lines: Allocation[] = input.allocations.map((a) => ({
      installmentId: a.installmentId.toLowerCase(),
      amount: this.amountOf(a.amount, currency, `allocations.${a.installmentId.toLowerCase()}`),
    }));
    this.checkState(entry);
    if (input.paidOn > entry.today) throw new DomainProblem('validation_failed', { fields: { paidOn: 'in_future' } });
    if (input.paymentMethodId !== null) await this.checkMethod(entry, input.paymentMethodId.toLowerCase());
    if (input.proofFileId !== undefined) {
      await this.checkProof(associationId, input.proofFileId.toLowerCase(), idempotencyKey);
    }

    const id = newId();
    const [row] = await currentTx()
      .insert(t)
      .values({
        id,
        associationId,
        projectId: entry.project.id,
        enrollmentId: entry.row.id,
        userId: actor.userId,
        amountDeclared: BigInt(amount),
        currency,
        paidOn: input.paidOn,
        paymentMethodId: input.paymentMethodId?.toLowerCase() ?? null,
        transactionReference: input.transactionReference ?? null,
        proofFileId: input.proofFileId?.toLowerCase() ?? null,
        comment: input.comment ?? null,
        idempotencyKey,
      })
      .onConflictDoNothing({ target: [t.userId, t.idempotencyKey] })
      .returning();
    // Même clé envoyée en même temps (réponse mémorisée pas encore écrite) : la première a gagné, rejouée.
    if (!row) return this.replayAfterConflict(entry, input, idempotencyKey);

    // Inscription relue une fois la clé étrangère posée : un retrait concurrent est vu.
    const [fresh] = await subscriberEnrollmentsOf({ projectId: entry.project.id });
    if (fresh?.row.id !== entry.row.id) throw new DomainProblem('invalid_state');
    this.checkState(fresh);

    const stored = await lockInstallments(
      associationId,
      entry.row.id,
      currency,
      lines.map((l) => l.installmentId),
    );
    const ofEnrollment = stored.filter((i) => i.enrollmentId === entry.row.id);
    try {
      proposeAllocation(amount, ofEnrollment);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'amount_exceeds_remaining') {
        const { maxAmount } = error.details as { maxAmount: number };
        throw new DomainProblem('amount_exceeds_remaining', { maxAmount });
      }
      if (error instanceof DomainError && error.code === 'invalid_amount') {
        throw new DomainProblem('validation_failed', { fields: { amount: 'invalid_amount' } });
      }
      throw error;
    }
    const check = validateAllocation(amount, lines, stored, { enrollmentId: entry.row.id });
    if (!check.ok) throw allocationProblem(check.errors);

    await insertAllocations(row, lines, 'proposed');
    const changed = moveAllocations(stored, { addPending: lines });
    await writePending(associationId, actor.userId, changed, fresh.today, fresh.project.graceDays);

    await this.outbox.publish(currentTx(), {
      type: 'payment.declared',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'payment', id },
      payload: { paymentId: id, projectId: entry.project.id, userId: actor.userId, amount },
    });
    recordAudit({
      entityType: 'payment',
      entityId: id,
      associationId,
      before: null,
      after: {
        status: row.status,
        amountDeclared: amount,
        paidOn: input.paidOn,
        paymentMethodId: row.paymentMethodId,
        proofFileId: row.proofFileId,
        allocations: lines,
      },
    });
    await checkDeferred();
    return this.viewOf(entry, id);
  }

  /** Inscription non retirée de la personne à ce projet (une au plus) ; sinon 404, comme me.project. */
  private async enrollmentOf(projectId: string): Promise<SubscriberEnrollment> {
    const entries = await subscriberEnrollmentsOf({ projectId: projectId.toLowerCase() });
    if (entries.length > 1) throw new Error('me.declare : plusieurs inscriptions sur le même projet');
    const [entry] = entries;
    if (!entry) throw new DomainProblem('not_found');
    return entry;
  }

  private checkState(entry: SubscriberEnrollment): void {
    // Association suspendue : historique visible, marqué, aucune déclaration (décision utilisateur du 2026-11-10).
    if (entry.association.suspended) throw new DomainProblem('association_suspended');
    if (entry.row.status === 'pending_signature') throw new DomainProblem('signature_required');
    if (entry.row.status !== 'active' || CLOSED_PROJECTS.has(entry.project.status)) {
      throw new DomainProblem('invalid_state');
    }
  }

  /** Moyen actif de l'association, retenu par le projet s'il en retient (sinon tous ceux de l'association, choix Q7). */
  private async checkMethod(entry: SubscriberEnrollment, methodId: string): Promise<void> {
    const method = (await subscriberPaymentMethodsOf([entry.association.id])).find((m) => m.id === methodId);
    const links = await subscriberProjectLinksOf(entry.project.id);
    const retained = links.length === 0 || links.some((l) => l.paymentMethodId === methodId);
    if (method?.associationId !== entry.association.id || !method.isActive || !retained) {
      throw new DomainProblem('validation_failed', { fields: { paymentMethodId: 'not_found' } });
    }
  }

  /**
   * Preuve de la personne, libre ou déjà rattachée à cette association, analysée saine. Déjà citée par un de ses
   * paiements dans une autre association (rattachement pas encore fait par le worker) : refusée aussi, sinon la
   * preuve irait à l'association traitée la première et resterait illisible pour l'autre. Analyse pas finie :
   * `file_scan_pending` ; infectée : `file_not_clean`. Déjà citée par un paiement en attente ou validé de cette
   * association : `proof_already_used` (un reçu, un paiement) ; après un rejet ou une annulation, réutilisable. La
   * preuve est verrouillée par `subscriberProofOf` : deux déclarations simultanées se suivent. Le paiement de la
   * personne portant la même `Idempotency-Key` n'est pas compté : envoi simultané (verrou Redis perdu), il est rejoué
   * par le conflit d'insertion, pas refusé.
   */
  private async checkProof(associationId: string, fileId: string, idempotencyKey: string): Promise<void> {
    const proof = await subscriberProofOf(fileId);
    if (!proof || (proof.associationId !== null && proof.associationId !== associationId)) {
      throw new DomainProblem('validation_failed', { fields: { proofFileId: 'not_found' } });
    }
    const [elsewhere] = await currentTx()
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.userId, requireActor().userId), eq(t.proofFileId, fileId), ne(t.associationId, associationId)))
      .limit(1);
    if (elsewhere) throw new DomainProblem('validation_failed', { fields: { proofFileId: 'not_found' } });
    if (proof.scanStatus === 'pending') throw new DomainProblem('file_scan_pending');
    if (proof.scanStatus !== 'clean') throw new DomainProblem('file_not_clean');
    const [used] = await currentTx()
      .select({ id: t.id })
      .from(t)
      .where(
        and(
          eq(t.userId, requireActor().userId),
          eq(t.associationId, associationId),
          eq(t.proofFileId, fileId),
          inArray(t.status, ['pending', 'validated']),
          ne(t.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (used) throw new DomainProblem('proof_already_used');
  }

  /**
   * Paiement de la personne déjà déclaré avec cette clé : le même s'il porte la même déclaration (projet, montant,
   * date, moyen, référence, preuve, répartition déclarée), sinon `idempotency_key_reused` (comme l'intercepteur, qui
   * compare tout le corps).
   */
  private async replayOf(
    entry: SubscriberEnrollment,
    input: Input,
    idempotencyKey: string,
  ): Promise<SubscriberPayment | null> {
    const actor = requireActor();
    const [row] = await currentTx()
      .select({
        id: t.id,
        associationId: t.associationId,
        projectId: t.projectId,
        amountDeclared: t.amountDeclared,
        currency: t.currency,
        paidOn: t.paidOn,
        paymentMethodId: t.paymentMethodId,
        transactionReference: t.transactionReference,
        proofFileId: t.proofFileId,
      })
      .from(t)
      .where(and(eq(t.userId, actor.userId), eq(t.idempotencyKey, idempotencyKey)));
    if (!row) return null;
    const same =
      row.projectId === entry.project.id &&
      row.amountDeclared === BigInt(input.amount.amount) &&
      row.currency === input.amount.currency &&
      row.paidOn === input.paidOn &&
      row.paymentMethodId === (input.paymentMethodId?.toLowerCase() ?? null) &&
      row.transactionReference === (input.transactionReference ?? null) &&
      row.proofFileId === (input.proofFileId?.toLowerCase() ?? null) &&
      sameLines(
        await declaredAllocationsOf(row.associationId, row.id, row.currency),
        input.allocations.map((a) => ({ installmentId: a.installmentId.toLowerCase(), amount: a.amount.amount })),
      );
    if (!same) throw new DomainProblem('idempotency_key_reused');
    return this.viewOf(entry, row.id);
  }

  private async replayAfterConflict(
    entry: SubscriberEnrollment,
    input: Input,
    idempotencyKey: string,
  ): Promise<SubscriberPayment> {
    const replayed = await this.replayOf(entry, input, idempotencyKey);
    if (!replayed) throw new Error('me.declare : conflit d’idempotence sans paiement');
    // Rien n'a été écrit par cet appel : l'entrée d'audit décrit le paiement rejoué, sans changement.
    recordAudit({ entityType: 'payment', entityId: replayed.id, associationId: entry.association.id });
    return replayed;
  }

  private async viewOf(entry: SubscriberEnrollment, paymentId: string): Promise<SubscriberPayment> {
    const association = entry.association;
    const views = await subscriberPaymentsOf([entry.row.id], {
      projects: new Map([[entry.project.id, { id: entry.project.id, name: entry.project.name }]]),
      associations: new Map([
        [
          association.id,
          {
            id: association.id,
            name: association.name,
            logoFileId: association.logoFileId,
            suspended: association.suspended,
          },
        ],
      ]),
    });
    const view = views.find((p) => p.id === paymentId);
    if (!view) throw new Error(`me.declare : paiement ${paymentId} introuvable`);
    return view;
  }

  /** Montant saisi dans la devise du projet (entier de sa plus petite unité), sinon 422 sur le champ. */
  private amountOf(money: { amount: number; currency: string }, currency: Currency, field: string): number {
    if (money.currency !== currency) {
      throw new DomainProblem('validation_failed', { fields: { [field]: 'currency_mismatch' } });
    }
    return money.amount;
  }
}

/** Mêmes lignes de répartition, dans n'importe quel ordre. */
function sameLines(a: Allocation[], b: Allocation[]): boolean {
  const key = (l: Allocation[]) =>
    l
      .map((x) => `${x.installmentId}:${String(x.amount)}`)
      .sort()
      .join(',');
  return a.length === b.length && key(a) === key(b);
}
