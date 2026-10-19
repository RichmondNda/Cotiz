import { Injectable } from '@nestjs/common';
import { sessions } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import { RevokedSessions } from '../infra/revoked-sessions.js';
import { SessionFamilies } from './session-families.js';

/**
 * auth.logout (architecture/03) : la connexion de la session du jeton est fermée (famille révoquée, jetons d'accès
 * récents en liste noire). Idempotent : une session déjà révoquée ne change rien. Seule une session de la personne du
 * jeton est révocable.
 */
@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly families: SessionFamilies,
    private readonly revoked: RevokedSessions,
  ) {}

  async execute(session: { userId: string; sessionId: string }, now = new Date()): Promise<AfterCommit<void>> {
    const [row] = await currentTx()
      .select({ familyId: sessions.familyId })
      .from(sessions)
      .where(and(eq(sessions.id, session.sessionId), eq(sessions.userId, session.userId)))
      .limit(1);
    const blacklist = row ? await this.families.revoke(row.familyId, now) : [];
    // Après le COMMIT : Redis indisponible n'annule pas la révocation en base (la réponse est alors une erreur).
    // Toujours le sid du jeton : même une session introuvable ne doit plus servir.
    return afterCommit(() => this.revoked.revoke([...new Set([...blacklist, session.sessionId])]));
  }
}
