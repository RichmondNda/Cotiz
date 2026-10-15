import { Injectable } from '@nestjs/common';
import { passwordResetRequests, users } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import { platformRoleOf } from '../../access/access.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { CodeService, type IssuedCode } from './code-service.js';

export class ResetNotAllowedError extends Error {
  override readonly name = 'ResetNotAllowedError';
}

/**
 * CLI `reset-password <email>` (architecture/03, § Mot de passe oublié, 5) : le super-admin n'a pas de rôle supérieur
 * pour traiter sa demande ; l'exploitant émet un code de réinitialisation (6 chiffres, 15 min) pour un membre actif
 * du personnel plateforme, à lui remettre. Ses demandes en attente passent « code émis ». Audité, code jamais
 * journalisé.
 */
@Injectable()
export class IssueResetCodeUseCase {
  constructor(private readonly codes: CodeService) {}

  @Audited('user.issue_reset_code')
  async execute(input: { email: string; operator: string }, now = new Date()): Promise<IssuedCode> {
    const tx = currentTx();
    const [user] = await tx
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (user?.status !== 'active' || (await platformRoleOf(user.id)) === null) {
      throw new ResetNotAllowedError('aucun membre actif du personnel plateforme avec cette adresse');
    }
    const issued = await this.codes.issue(
      { userId: user.id, purpose: 'password_reset', associationId: null, issuedBy: null },
      now,
    );
    await tx
      .update(passwordResetRequests)
      .set({ status: 'code_issued', codeId: issued.id })
      .where(and(eq(passwordResetRequests.userId, user.id), eq(passwordResetRequests.status, 'pending')));
    recordAudit({ entityType: 'user', entityId: user.id, associationId: null, after: { operator: input.operator } });
    return issued;
  }
}
