import { Inject, Injectable } from '@nestjs/common';
import type { IssuedResetCode } from '@cotiz/contracts';
import { passwordResetRequests as t, users } from '@cotiz/db';
import { and, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { type AfterCommit, afterCommit, currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { buildHandoff } from '../domain/handoff.js';
import { CodeService } from './code-service.js';
import { platformHandled, toResetRequests } from './platform-reset-requests.js';
import { SpaceAccess } from './space-access.js';

/**
 * pf.resets (issueCode), architecture/03 § Mot de passe oublié, 3 : après vérification de l'identité hors ligne, le
 * super-admin émet un code de réinitialisation (6 chiffres, 15 min) pour le gestionnaire, affiché une fois avec le
 * message prêt. Une demande déjà traitée : 409 `request_already_handled` (sous verrou de la ligne : deux émissions
 * simultanées n'en font qu'une). Les autres demandes en attente de la personne sont traitées avec elle (un seul code
 * vaut, émettre invalide le précédent, y compris un code de réinitialisation remis par une association où la personne
 * est souscriptrice). Verrou par personne avant les lignes (celui des nouvelles demandes, auth.forgot) : deux émissions
 * sur deux demandes de la même personne s'attendent au lieu de s'interbloquer. Personne qui n'est plus gestionnaire
 * active (compte inactif, appartenance retirée) : ses demandes passent « ignorées », aucun code, 404. Demande hors de
 * pf.resets (souscripteur, personnel plateforme) ou inconnue : 404. Audité, password_reset.code_issued ; jamais de
 * code dans l'audit, l'événement ou un journal.
 */
@Injectable()
export class IssuePlatformResetCodeUseCase {
  constructor(
    private readonly codes: CodeService,
    private readonly outbox: OutboxService,
    private readonly spaceAccess: SpaceAccess,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Audited('password_reset.issue_code')
  async execute(id: string, now = new Date()): Promise<z.infer<typeof IssuedResetCode> | AfterCommit<never>> {
    if (currentContext()?.space !== 'platform') throw new Error('pf.resets : espace plateforme seulement');
    const actor = requireActor();
    const tx = currentTx();
    const [target] = await tx
      .select({ userId: t.userId })
      .from(t)
      .where(and(eq(t.id, id), platformHandled));
    if (!target) throw new DomainProblem('not_found');
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`password_reset_requests:${target.userId}`}, 0))`,
    );
    const [request] = await tx
      .select()
      .from(t)
      .where(and(eq(t.id, id), platformHandled))
      .for('update');
    if (!request) throw new DomainProblem('not_found');
    if (request.status !== 'pending') throw new DomainProblem('request_already_handled');

    const [person] = await tx.select({ status: users.status }).from(users).where(eq(users.id, request.userId));
    if (person?.status !== 'active' || !(await this.spaceAccess.allows(request.userId, 'association'))) {
      await tx
        .update(t)
        .set({ status: 'dismissed', handledBy: actor.userId, handledAt: now })
        .where(and(eq(t.userId, request.userId), eq(t.status, 'pending'), platformHandled));
      recordAudit({
        entityType: 'password_reset_request',
        entityId: id,
        associationId: null,
        before: { status: request.status },
        after: { status: 'dismissed' },
      });
      // L'écriture doit survivre à l'erreur : levée après le COMMIT.
      return afterCommit(() => Promise.reject(new DomainProblem('not_found')));
    }

    const issued = await this.codes.issue(
      { userId: request.userId, purpose: 'password_reset', associationId: null, issuedBy: actor.userId },
      now,
    );
    await tx
      .update(t)
      .set({ status: 'code_issued', codeId: issued.id, handledBy: actor.userId, handledAt: now })
      .where(and(eq(t.userId, request.userId), eq(t.status, 'pending'), platformHandled));
    await this.outbox.publish(tx, {
      type: 'password_reset.code_issued',
      associationId: null,
      actorUserId: actor.userId,
      aggregate: { type: 'password_reset_request', id },
      payload: { requestId: id, issuedBy: actor.userId },
    });
    recordAudit({
      entityType: 'password_reset_request',
      entityId: id,
      associationId: null,
      before: { status: request.status },
      after: { status: 'code_issued' },
    });

    const [updated] = await tx.select().from(t).where(eq(t.id, id));
    const [mapped] = await toResetRequests(updated ? [updated] : []);
    const [recipient] = await tx
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phoneE164,
      })
      .from(users)
      .where(eq(users.id, request.userId));
    if (!mapped || !recipient) throw new Error(`demande ${id} : relecture impossible`);
    return {
      request: mapped,
      handoff: buildHandoff({
        purpose: 'password_reset',
        space: 'association',
        code: issued.code,
        expiresAt: issued.expiresAt,
        recipient,
        appUrl: this.config.APP_PUBLIC_URL ?? 'http://localhost:3000',
      }),
    };
  }
}
