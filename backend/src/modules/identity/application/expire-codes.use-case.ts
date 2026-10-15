import { Injectable, Logger } from '@nestjs/common';
import { oneTimeCodes, passwordResetRequests } from '@cotiz/db';
import { and, eq, gte, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';
import { RESET_TOKEN_TTL_MS } from '../domain/login-policy.js';
import { MAX_CODE_ATTEMPTS } from '../domain/one-time-code.js';

/** Demande « mot de passe oublié » jamais traitée : expirée au bout de 7 jours (la personne en refait une). */
const PENDING_REQUEST_TTL_MS = 7 * 86_400_000;

/**
 * Tâche `codes.expire` (jobs.yaml : horaire, lot 1.1), espace system, idempotente :
 * - codes non consommés expirés ou bloqués (5 essais) : `code_encrypted` effacé (un code ré-affichable ne survit pas
 *   à sa validité) ;
 * - demandes de réinitialisation dont le code émis a expiré sans servir (et dont aucun jeton n'est plus valable), ou
 *   restées à traiter plus de 7 jours : `expired`.
 */
@Injectable()
export class ExpireCodesUseCase {
  private readonly logger = new Logger(ExpireCodesUseCase.name);

  constructor(private readonly db: TenantDatabase) {}

  async execute(now: Date): Promise<void> {
    const counts = await this.db.withTenantContext({ space: 'system' }, async () => {
      const tx = currentTx();
      // Chiffré d'un code qui ne servira plus : expiré, ou bloqué par ses 5 essais.
      const codes = await tx
        .update(oneTimeCodes)
        .set({ codeEncrypted: null })
        .where(
          and(
            isNotNull(oneTimeCodes.codeEncrypted),
            isNull(oneTimeCodes.consumedAt),
            or(lte(oneTimeCodes.expiresAt, now), gte(oneTimeCodes.attempts, MAX_CODE_ATTEMPTS)),
          ),
        )
        .returning({ id: oneTimeCodes.id });
      // Un code vérifié juste avant son échéance donne un jeton de réinitialisation valable encore 10 min : la demande
      // n'expire qu'ensuite, sinon une réinitialisation réussie laisserait une demande « Expirée ».
      const deadCodes = tx
        .select({ id: oneTimeCodes.id })
        .from(oneTimeCodes)
        .where(
          and(
            isNull(oneTimeCodes.consumedAt),
            lte(oneTimeCodes.expiresAt, new Date(now.getTime() - RESET_TOKEN_TTL_MS)),
          ),
        );
      const issued = await tx
        .update(passwordResetRequests)
        .set({ status: 'expired' })
        .where(and(eq(passwordResetRequests.status, 'code_issued'), inArray(passwordResetRequests.codeId, deadCodes)))
        .returning({ id: passwordResetRequests.id });
      const pending = await tx
        .update(passwordResetRequests)
        .set({ status: 'expired' })
        .where(
          and(
            eq(passwordResetRequests.status, 'pending'),
            lte(passwordResetRequests.createdAt, new Date(now.getTime() - PENDING_REQUEST_TTL_MS)),
          ),
        )
        .returning({ id: passwordResetRequests.id });
      return { codes: codes.length, requests: issued.length + pending.length };
    });
    if (counts.codes > 0 || counts.requests > 0) this.logger.log({ msg: 'codes et demandes expirés', ...counts });
  }
}
