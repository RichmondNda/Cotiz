import { Injectable } from '@nestjs/common';
import { sessions } from '@cotiz/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { ACCESS_TOKEN_TTL_MS } from '../domain/login-policy.js';

/**
 * Famille de sessions : une connexion et ses rotations successives (sessions.family_id).
 * - `lock` : verrou transactionnel de la famille, pris par toute rotation et toute révocation. Sans lui, une
 *   révocation (READ COMMITTED) ne verrait pas la session insérée par une rotation concurrente, qui survivrait.
 * - `revoke` : sessions encore actives révoquées en base ; renvoie les sessions dont un jeton d'accès peut encore être
 *   valide, à mettre en liste noire APRÈS le COMMIT (Redis indisponible n'annule jamais la révocation en base).
 */
@Injectable()
export class SessionFamilies {
  async lock(familyId: string): Promise<void> {
    await currentTx().execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${familyId}::text, 0))`);
  }

  async revoke(familyId: string, now: Date): Promise<string[]> {
    const tx = currentTx();
    await this.lock(familyId);
    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
    // Un jeton d'accès n'est signé qu'à la création de sa session et vit 15 min : les sessions plus anciennes n'en ont
    // plus de valide. Marge d'une minute : created_at (horloge de la base) et l'heure de signature (horloge de l'api).
    const recent = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.familyId, familyId),
          gt(sessions.createdAt, new Date(now.getTime() - ACCESS_TOKEN_TTL_MS - 60_000)),
        ),
      );
    return recent.map((row) => row.id);
  }
}
