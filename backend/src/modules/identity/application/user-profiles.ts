import { Injectable } from '@nestjs/common';
import { credentials, updateWithVersion, users } from '@cotiz/db';
import { and, eq, ne, sql } from 'drizzle-orm';
import { activeMembershipsOf, MANAGEMENT_ROLES, platformRoleOf } from '../../access/access.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

/** Identité de la personne connectée, telle que l'affichent les écrans de profil (me.profile, lot 3.1). */
export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  locale: string;
  passwordChangedAt: Date | null;
  /** Double authentification : lot 4.7 (mfa_factors) ; aucune avant. */
  mfaEnabled: boolean;
  version: number;
}

export interface UserProfileChanges {
  firstName?: string | undefined;
  lastName?: string | undefined;
  email?: string | null | undefined;
  locale?: string | undefined;
}

/**
 * Identité de la personne du jeton (users, credentials), pour me.profile : lue et modifiée dans la transaction de
 * l'appelant (espace me), jamais celle d'une autre personne (l'identifiant vient du contexte posé par les gardes).
 * Le module members y ajoute l'adresse du profil de souscripteur, qu'il possède.
 * - Email déjà porté par un autre compte : 422 `validation_failed` (`email: 'taken'`), sous verrou de l'adresse (deux
 *   personnes ne prennent pas la même en même temps), comme `SubscriberAccounts.updateIdentity`.
 * - Email retiré par un gestionnaire ou un membre du personnel plateforme : c'est leur identifiant de connexion,
 *   422 `validation_failed` (`email: 'required'`).
 * - Le téléphone (identifiant du souscripteur) ne se modifie pas ici : « Contactez votre association ».
 */
@Injectable()
export class UserProfiles {
  async read(userId: string): Promise<UserProfile | null> {
    const [row] = await currentTx()
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phoneE164,
        locale: users.locale,
        version: users.version,
        passwordChangedAt: credentials.passwordChangedAt,
      })
      .from(users)
      .leftJoin(credentials, eq(credentials.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    return row ? { ...row, passwordChangedAt: row.passwordChangedAt ?? null, mfaEnabled: false } : null;
  }

  /** Renvoie la nouvelle version (inchangée si rien n'est modifié). */
  async update(userId: string, changes: UserProfileChanges): Promise<number> {
    const tx = currentTx();
    const [current] = await tx.select({ version: users.version }).from(users).where(eq(users.id, userId)).for('update');
    if (!current) throw new DomainProblem('session_expired');
    if (changes.email === null && (await this.signsInByEmail(userId))) {
      throw new DomainProblem('validation_failed', { fields: { email: 'required' } });
    }
    if (changes.email) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`users:email:${changes.email.toLowerCase()}`}, 0))`,
      );
      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, changes.email), ne(users.id, userId)))
        .limit(1);
      if (taken) throw new DomainProblem('validation_failed', { fields: { email: 'taken' } });
    }
    const set = {
      ...(changes.firstName === undefined ? {} : { firstName: changes.firstName }),
      ...(changes.lastName === undefined ? {} : { lastName: changes.lastName }),
      ...(changes.email === undefined ? {} : { email: changes.email }),
      ...(changes.locale === undefined ? {} : { locale: changes.locale }),
    };
    if (Object.keys(set).length === 0) return current.version;
    const updated = await updateWithVersion(tx, users, { id: userId, version: current.version }, set);
    if (!updated) throw new DomainProblem('session_expired');
    return updated.version;
  }

  /** Gestionnaire (owner, manager, viewer) ou personnel plateforme : l'email est son identifiant de connexion. */
  private async signsInByEmail(userId: string): Promise<boolean> {
    if ((await platformRoleOf(userId)) !== null) return true;
    const roles: readonly string[] = MANAGEMENT_ROLES;
    return (await activeMembershipsOf(userId)).some((m) => roles.includes(m.role));
  }
}
