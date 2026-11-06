import { Inject, Injectable } from '@nestjs/common';
import type { IssuedResetCode } from '@cotiz/contracts';
import { passwordResetRequests as t, users } from '@cotiz/db';
import { and, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { holdsMembership, isActiveSubscriberIn, platformRoleOf } from '../../access/access.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import { buildHandoff } from '../domain/handoff.js';
import { associationHandled, resetsAssociationId, toAssociationResetRequests } from './association-reset-requests.js';
import { CodeService } from './code-service.js';

/**
 * as.resets (issueCode), architecture/03 § Mot de passe oublié, 3 : après vérification de l'identité hors ligne, la
 * gestionnaire émet un code de réinitialisation (6 chiffres, 15 min) pour un souscripteur de l'association, affiché une
 * fois avec le message prêt. Même déroulé que pf.resets :
 * - demande inconnue, d'une autre association ou hors as.resets : 404 ; déjà traitée : 409 `request_already_handled`
 *   (sous verrou de la ligne, après le verrou par personne d'auth.forgot) ;
 * - les autres demandes en attente de la personne DANS CETTE ASSOCIATION sont traitées avec elle ; un seul code vaut
 *   (le dernier émis : CodeService.verify ne lit que lui) ;
 * - rôle le plus élevé (décision du 2026-11-06, lot 3.1) : le mot de passe vaut pour tous les espaces, l'association ne
 *   le réinitialise que pour un simple souscripteur. Compte inactif, souscripteur retiré de l'association, gestionnaire
 *   d'une association (même une autre) ou personnel de la plateforme : demandes de l'association « ignorées », aucun
 *   code, 404 (leur demande est traitée par la plateforme ou par le script `reset-password`).
 * Audité, password_reset.code_issued ; jamais de code dans l'audit, l'événement ou un journal.
 */
@Injectable()
export class IssueAssociationResetCodeUseCase {
  constructor(
    private readonly codes: CodeService,
    private readonly outbox: OutboxService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Audited('password_reset.issue_code')
  async execute(
    aid: string,
    id: string,
    now = new Date(),
  ): Promise<z.infer<typeof IssuedResetCode> | AfterCommit<never>> {
    const associationId = resetsAssociationId(aid);
    const actor = requireActor();
    const tx = currentTx();
    const handled = associationHandled(associationId);
    const [target] = await tx
      .select({ userId: t.userId })
      .from(t)
      .where(and(eq(t.id, id), handled));
    if (!target) throw new DomainProblem('not_found');
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`password_reset_requests:${target.userId}`}, 0))`,
    );
    const [request] = await tx
      .select()
      .from(t)
      .where(and(eq(t.id, id), handled))
      .for('update');
    if (!request) throw new DomainProblem('not_found');
    if (request.status !== 'pending') throw new DomainProblem('request_already_handled');

    const [person] = await tx.select({ status: users.status }).from(users).where(eq(users.id, request.userId));
    const eligible =
      person?.status === 'active' &&
      (await isActiveSubscriberIn(associationId, request.userId)) &&
      !(await holdsMembership(request.userId, 'association', ['active', 'invited'])) &&
      (await platformRoleOf(request.userId)) === null;
    if (!eligible) {
      await tx
        .update(t)
        .set({ status: 'dismissed', handledBy: actor.userId, handledAt: now })
        .where(and(eq(t.userId, request.userId), eq(t.status, 'pending'), handled));
      recordAudit({
        entityType: 'password_reset_request',
        entityId: id,
        before: { status: request.status },
        after: { status: 'dismissed' },
      });
      // L'écriture doit survivre à l'erreur : levée après le COMMIT.
      return afterCommit(() => Promise.reject(new DomainProblem('not_found')));
    }

    const issued = await this.codes.issue(
      { userId: request.userId, purpose: 'password_reset', associationId, issuedBy: actor.userId },
      now,
    );
    await tx
      .update(t)
      .set({ status: 'code_issued', codeId: issued.id, handledBy: actor.userId, handledAt: now })
      .where(and(eq(t.userId, request.userId), eq(t.status, 'pending'), handled));
    await this.outbox.publish(tx, {
      type: 'password_reset.code_issued',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'password_reset_request', id },
      payload: { requestId: id, issuedBy: actor.userId },
    });
    recordAudit({
      entityType: 'password_reset_request',
      entityId: id,
      before: { status: request.status },
      after: { status: 'code_issued' },
    });

    const [updated] = await tx
      .select()
      .from(t)
      .where(and(eq(t.id, id), handled));
    const [mapped] = await toAssociationResetRequests(associationId, updated ? [updated] : []);
    if (!mapped) throw new Error(`demande ${id} : relecture impossible`);
    return {
      request: mapped,
      handoff: buildHandoff({
        purpose: 'password_reset',
        space: 'subscriber',
        code: issued.code,
        expiresAt: issued.expiresAt,
        recipient: mapped.user,
        appUrl: this.config.APP_PUBLIC_URL ?? 'http://localhost:3000',
      }),
    };
  }
}
