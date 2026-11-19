import { Inject, Injectable } from '@nestjs/common';
import { mfaFactors } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { CODES_SECRET_BOX, type SecretBox } from '../../../shared/crypto/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

/** Facteur TOTP d'une personne : secret déchiffré, codes de secours hachés. */
export interface TotpFactor {
  id: string;
  secret: string;
  confirmedAt: Date | null;
  recoveryCodeHashes: string[];
}

/** Données associées du chiffré : un secret recopié sur une autre ligne ne se déchiffre plus. */
const sealContext = (factorId: string) => `mfa_factors:${factorId}`;

/**
 * Facteurs de double authentification (mfa_factors, lot 4.7 ; table globale sans RLS, module identity seul), dans la
 * transaction de l'appelant. Une personne a au plus un facteur TOTP confirmé ; un enrôlement non confirmé est remplacé
 * par le suivant. Le secret n'est jamais journalisé ni renvoyé hors de l'enrôlement.
 */
@Injectable()
export class MfaFactors {
  constructor(@Inject(CODES_SECRET_BOX) private readonly box: SecretBox) {}

  /**
   * Verrou transactionnel des facteurs de la personne : enrôlements et confirmations simultanés sérialisés (jamais
   * deux facteurs confirmés, aucun index unique au schéma).
   */
  async lock(userId: string): Promise<void> {
    await currentTx().execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`mfa_factors:${userId}`}, 0))`);
  }

  /** La personne a-t-elle un second facteur confirmé ? */
  async hasConfirmed(userId: string): Promise<boolean> {
    const [row] = await currentTx()
      .select({ id: mfaFactors.id })
      .from(mfaFactors)
      .where(and(eq(mfaFactors.userId, userId), eq(mfaFactors.type, 'totp'), isNotNull(mfaFactors.confirmedAt)))
      .limit(1);
    return row !== undefined;
  }

  /** Facteur confirmé, `FOR UPDATE` (codes de secours consommés une seule fois). */
  async confirmedFor(userId: string): Promise<TotpFactor | null> {
    const [row] = await currentTx()
      .select()
      .from(mfaFactors)
      .where(and(eq(mfaFactors.userId, userId), eq(mfaFactors.type, 'totp'), isNotNull(mfaFactors.confirmedAt)))
      .orderBy(mfaFactors.confirmedAt, mfaFactors.id)
      .limit(1)
      .for('update');
    return row ? this.factorOf(row) : null;
  }

  /** Dernier enrôlement non confirmé, `FOR UPDATE`. */
  async pendingFor(userId: string): Promise<TotpFactor | null> {
    const [row] = await currentTx()
      .select()
      .from(mfaFactors)
      .where(and(eq(mfaFactors.userId, userId), eq(mfaFactors.type, 'totp'), isNull(mfaFactors.confirmedAt)))
      .orderBy(desc(mfaFactors.createdAt), desc(mfaFactors.id))
      .limit(1)
      .for('update');
    return row ? this.factorOf(row) : null;
  }

  /** Nouvel enrôlement : les enrôlements non confirmés de la personne sont supprimés (jamais un facteur confirmé). */
  async startEnrollment(userId: string, secret: string): Promise<void> {
    const tx = currentTx();
    await tx
      .delete(mfaFactors)
      .where(and(eq(mfaFactors.userId, userId), eq(mfaFactors.type, 'totp'), isNull(mfaFactors.confirmedAt)));
    const id = newId();
    await tx.insert(mfaFactors).values({
      id,
      userId,
      type: 'totp',
      secretEncrypted: this.box.seal(secret, sealContext(id)),
    });
  }

  async confirm(factorId: string, recoveryCodeHashes: string[], now: Date): Promise<void> {
    await currentTx()
      .update(mfaFactors)
      .set({ confirmedAt: now, recoveryCodeHashes })
      .where(eq(mfaFactors.id, factorId));
  }

  /**
   * seed-dev (développement seulement) : facteur confirmé au secret donné, sans code de secours ; tout autre facteur de
   * la personne est supprimé.
   */
  async replaceWithConfirmed(userId: string, secret: string, now: Date): Promise<void> {
    const tx = currentTx();
    await tx.delete(mfaFactors).where(eq(mfaFactors.userId, userId));
    const id = newId();
    await tx.insert(mfaFactors).values({
      id,
      userId,
      type: 'totp',
      secretEncrypted: this.box.seal(secret, sealContext(id)),
      confirmedAt: now,
    });
  }

  /** Tous les facteurs de la personne (seed-dev : facteur au secret public retiré du dev en ligne). */
  async removeAll(userId: string): Promise<void> {
    await currentTx().delete(mfaFactors).where(eq(mfaFactors.userId, userId));
  }

  /** Codes de secours restants (un code utilisé est retiré). */
  async replaceRecoveryCodes(factorId: string, recoveryCodeHashes: string[]): Promise<void> {
    await currentTx().update(mfaFactors).set({ recoveryCodeHashes }).where(eq(mfaFactors.id, factorId));
  }

  private factorOf(row: typeof mfaFactors.$inferSelect): TotpFactor {
    return {
      id: row.id,
      secret: this.box.open(row.secretEncrypted, sealContext(row.id)),
      confirmedAt: row.confirmedAt,
      recoveryCodeHashes: row.recoveryCodeHashes,
    };
  }
}
