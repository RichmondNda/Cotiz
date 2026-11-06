import { Injectable } from '@nestjs/common';
import { credentials, updateWithVersion, users } from '@cotiz/db';
import { eq } from 'drizzle-orm';
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
 * - Email et téléphone (identifiants de connexion) : non modifiables ici en V1 (voir `update`).
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

  /**
   * Renvoie la nouvelle version (inchangée si rien n'est modifié). L'email n'est pas modifiable en libre-service en V1
   * (décision du 2026-11-06, lot 3.1) : sans fournisseur, rien ne prouve que la personne détient l'adresse, et un compte
   * actif qui porte l'email d'un demandeur se voit rattacher l'association à l'approbation (onboarding, lot 1.3). Un
   * email différent de l'actuel : 422 `validation_failed` (`email: 'not_editable'`) ; le même : sans effet. Il est
   * changé par le rôle supérieur (gestionnaire pour un souscripteur : mb.patch).
   */
  async update(userId: string, changes: UserProfileChanges): Promise<number> {
    const tx = currentTx();
    const [current] = await tx
      .select({ version: users.version, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');
    if (!current) throw new DomainProblem('session_expired');
    if (
      changes.email !== undefined &&
      (changes.email?.toLowerCase() ?? null) !== (current.email?.toLowerCase() ?? null)
    ) {
      throw new DomainProblem('validation_failed', { fields: { email: 'not_editable' } });
    }
    const set = {
      ...(changes.firstName === undefined ? {} : { firstName: changes.firstName }),
      ...(changes.lastName === undefined ? {} : { lastName: changes.lastName }),
      ...(changes.locale === undefined ? {} : { locale: changes.locale }),
    };
    if (Object.keys(set).length === 0) return current.version;
    const updated = await updateWithVersion(tx, users, { id: userId, version: current.version }, set);
    if (!updated) throw new DomainProblem('session_expired');
    return updated.version;
  }
}
