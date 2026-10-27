import { Inject, Injectable } from '@nestjs/common';
import type { Handoff } from '@cotiz/contracts';
import { credentials, oneTimeCodes, updateWithVersion, users } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { and, type AnyColumn, desc, eq, gte, inArray, isNull, ne, or, type SQL, sql } from 'drizzle-orm';
import { CONFIG, type Config } from '../../../config.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { containsPattern } from '../../../shared/pagination/index.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { buildHandoff } from '../domain/handoff.js';
import { CodeService, type PreparedCode } from './code-service.js';

/**
 * Compte retrouvé par son téléphone (ajout d'un souscripteur) : prénom, initiale du nom et statut seulement, jamais le
 * nom complet ni les coordonnées (architecture/04 § 4.3).
 */
export interface PhoneAccount {
  id: string;
  firstName: string;
  lastInitial: string;
  status: (typeof users.status.enumValues)[number];
}

/** Initiale (majuscule, un seul caractère UTF-16 : contrat `length(1)`) du nom, sinon du prénom ; `?` à défaut. */
export function initialOf(lastName: string, firstName: string): string {
  for (const name of [lastName, firstName]) {
    const code = name.trim().codePointAt(0);
    const first = code === undefined ? undefined : String.fromCodePoint(code).toUpperCase();
    if (first?.length === 1) return first;
  }
  return '?';
}

/**
 * Compte de ce téléphone E.164 (clé de dédoublonnage des souscripteurs, users.phone_e164 unique) ; `null` sinon.
 * Contexte d'une association seulement : `users` est globale sans RLS, seuls le prénom et l'initiale du nom en sortent.
 */
export async function accountByPhone(phone: string): Promise<PhoneAccount | null> {
  assertAssociation('accountByPhone');
  const [row] = await currentTx()
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, status: users.status })
    .from(users)
    .where(eq(users.phoneE164, phone))
    .limit(1);
  return row
    ? { id: row.id, firstName: row.firstName, lastInitial: initialOf(row.lastName, row.firstName), status: row.status }
    : null;
}

/**
 * Condition SQL « le compte de cette colonne correspond à la recherche » (annuaire, inscriptions d'un projet) : nom
 * complet ou téléphone contenant le texte, sans casse (index trigramme users_name_trgm). Lire `users` hors du module
 * identity sans exposer ses colonnes.
 */
export function accountMatches(userId: AnyColumn, q: string): SQL {
  const pattern = containsPattern(q.trim());
  const digits = q.replace(/\D/g, '');
  return sql`EXISTS (SELECT 1 FROM ${users} WHERE ${users.id} = ${userId} AND ${or(
    sql`(${users.firstName} || ' ' || ${users.lastName}) ILIKE ${pattern}`,
    digits.length >= 4 ? sql`${users.phoneE164} LIKE ${containsPattern(digits)}` : undefined,
  )})`;
}

/** Identité d'un souscripteur modifiable par l'association qui a créé le compte, tant qu'il n'est pas activé (Q7). */
export interface IdentityChanges {
  firstName?: string | undefined;
  lastName?: string | undefined;
  /** E.164, revalidé par l'appelant (libphonenumber-js). */
  phone?: string | undefined;
  email?: string | null | undefined;
}

/** Coordonnées d'un souscripteur (réponses des inscriptions, message prêt) et état de son compte. */
export interface SubscriberContact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  status: (typeof users.status.enumValues)[number];
}

export interface NewSubscriber {
  /** E.164, revalidé par l'appelant (libphonenumber-js). */
  phone: string;
  firstName: string;
  lastName: string;
  email?: string | null | undefined;
}

/**
 * Comptes des souscripteurs inscrits par une association (architecture/04 § 4.3), dans la transaction de l'appelant,
 * contexte de cette association seulement (`users` est globale sans RLS). Code d'activation émis par l'association
 * (RLS tenant_manage), chiffré pour le ré-afficher et reconstruire le message prêt au rejeu idempotent.
 */
@Injectable()
export class SubscriberAccounts {
  constructor(
    private readonly codes: CodeService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /**
   * Verrou de transaction sur ce téléphone, avant de chercher puis créer son compte : deux inscriptions simultanées du
   * même numéro (même projet, autre projet, autre association) se suivent, la seconde voit le compte de la première.
   */
  async lockPhone(phone: string): Promise<void> {
    assertAssociation('SubscriberAccounts.lockPhone');
    await currentTx().execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`users:phone:${phone}`}, 0))`);
  }

  /** `lock: 'share'` : le statut ne change pas avant la fin de la transaction (activation simultanée). */
  async contactOf(userId: string, options: { lock?: 'share' } = {}): Promise<SubscriberContact | null> {
    assertAssociation('SubscriberAccounts.contactOf');
    const query = currentTx()
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phoneE164,
        email: users.email,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const [row] = options.lock ? await query.for('share') : await query;
    return row ?? null;
  }

  /**
   * Coordonnées de plusieurs comptes (listes de l'association, ou de la plateforme : pf.asso.sub) ; les identifiants
   * inconnus sont absents. L'appelant ne passe que des personnes inscrites chez l'association lue.
   */
  async contactsOf(userIds: readonly string[]): Promise<Map<string, SubscriberContact>> {
    if (currentContext()?.space !== 'platform') assertAssociation('SubscriberAccounts.contactsOf');
    if (userIds.length === 0) return new Map();
    const rows = await currentTx()
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phoneE164,
        email: users.email,
        status: users.status,
      })
      .from(users)
      .where(inArray(users.id, [...userIds]));
    return new Map(rows.map((row) => [row.id, row]));
  }

  /** Version du compte (verrou optimiste de la fiche, mb.patch) ; `null` s'il n'existe pas. */
  async versionOf(userId: string): Promise<number | null> {
    assertAssociation('SubscriberAccounts.versionOf');
    const [row] = await currentTx().select({ version: users.version }).from(users).where(eq(users.id, userId));
    return row?.version ?? null;
  }

  /**
   * Fiche modifiée (mb.patch) sous verrou optimiste : identité (`changes`, vide pour l'adresse seule), version
   * incrémentée dans tous les cas ; la nouvelle version. Téléphone déjà porté par une autre personne : `phone_taken` ;
   * email : `validation_failed` (`email: taken`, choix de l'étape). Version périmée : VersionConflictError (412).
   */
  async updateIdentity(userId: string, version: number, changes: IdentityChanges): Promise<number> {
    assertAssociation('SubscriberAccounts.updateIdentity');
    const tx = currentTx();
    if (changes.phone !== undefined) {
      await this.lockPhone(changes.phone);
      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phoneE164, changes.phone), ne(users.id, userId)))
        .limit(1);
      if (taken) throw new DomainProblem('phone_taken');
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
    const updated = await updateWithVersion(
      tx,
      users,
      { id: userId, version },
      {
        ...(changes.firstName === undefined ? {} : { firstName: changes.firstName }),
        ...(changes.lastName === undefined ? {} : { lastName: changes.lastName }),
        ...(changes.phone === undefined ? {} : { phoneE164: changes.phone }),
        ...(changes.email === undefined ? {} : { email: changes.email }),
      },
    );
    if (!updated) throw new DomainProblem('not_found');
    return updated.version;
  }

  /**
   * Avant de régénérer le code d'activation de la personne, dans l'ordre de auth.activate (code puis compte) : verrou
   * d'émission, codes non consommés de l'association verrouillés. Une activation en cours aboutit d'abord ; l'appelant
   * relit ensuite le statut (`contactOf` avec `lock: 'share'`).
   */
  async lockActivation(userId: string): Promise<void> {
    assertAssociation('SubscriberAccounts.lockActivation');
    await this.codes.lockIssuance(userId, 'activation');
    await currentTx()
      .select({ id: oneTimeCodes.id })
      .from(oneTimeCodes)
      .where(
        and(eq(oneTimeCodes.userId, userId), eq(oneTimeCodes.purpose, 'activation'), isNull(oneTimeCodes.consumedAt)),
      )
      .orderBy(oneTimeCodes.id)
      .for('update');
  }

  /**
   * Nouveau compte en attente d'activation (sans mot de passe) ; son identifiant. Le téléphone doit être libre
   * (appelant sous `lockPhone`). Email déjà porté par une autre personne : compte créé sans email, sans le signaler
   * (l'endpoint ne doit pas révéler qu'une adresse a un compte).
   */
  async create(input: NewSubscriber): Promise<string> {
    assertAssociation('SubscriberAccounts.create');
    const tx = currentTx();
    let email = input.email ?? null;
    if (email) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`users:email:${email.toLowerCase()}`}, 0))`);
      const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (taken) email = null;
    }
    const userId = newId();
    await tx.insert(users).values({
      id: userId,
      phoneE164: input.phone,
      email,
      firstName: input.firstName,
      lastName: input.lastName,
      status: 'pending_activation',
    });
    await tx.insert(credentials).values({ userId });
    return userId;
  }

  /** Émet le code d'activation de l'association (invalide tout code précédent de la personne) ; le message prêt. */
  async issueActivation(
    userId: string,
    associationId: string,
    issuedBy: string,
    prepared?: PreparedCode,
  ): Promise<{ codeId: string; handoff: Handoff }> {
    assertAssociation('SubscriberAccounts.issueActivation');
    const code = await this.codes.issue({
      userId,
      purpose: 'activation',
      associationId,
      issuedBy,
      redisplayable: true,
      prepared,
    });
    return { codeId: code.id, handoff: await this.handoff(userId, code.code, code.expiresAt) };
  }

  /** Code d'activation tiré et haché d'avance, hors transaction (ajout en lot) ; à passer à `issueActivation`. */
  prepareActivation(): Promise<PreparedCode> {
    return this.codes.prepare('activation');
  }

  /**
   * Message prêt du code émis par `issuedBy` pour l'association depuis `since` (rejeu de la même opération) ; `null` si
   * ce code est consommé, expiré, bloqué, remplacé, ou s'il n'y en a pas eu (compte déjà actif).
   */
  async reissuedHandoff(userId: string, associationId: string, issuedBy: string, since: Date): Promise<Handoff | null> {
    assertAssociation('SubscriberAccounts.reissuedHandoff');
    const [row] = await currentTx()
      .select({ id: oneTimeCodes.id, expiresAt: oneTimeCodes.expiresAt })
      .from(oneTimeCodes)
      .where(
        and(
          eq(oneTimeCodes.userId, userId),
          eq(oneTimeCodes.purpose, 'activation'),
          eq(oneTimeCodes.associationId, associationId),
          eq(oneTimeCodes.issuedBy, issuedBy),
          gte(oneTimeCodes.createdAt, since),
        ),
      )
      .orderBy(desc(oneTimeCodes.createdAt), desc(oneTimeCodes.id))
      .limit(1);
    const code = row ? await this.codes.reveal(row.id) : null;
    return row && code ? this.handoff(userId, code, row.expiresAt) : null;
  }

  private async handoff(userId: string, code: string, expiresAt: Date): Promise<Handoff> {
    const contact = await this.contactOf(userId);
    if (!contact) throw new Error('SubscriberAccounts : compte introuvable');
    const { status: _status, ...recipient } = contact;
    return this.message(recipient, code, expiresAt);
  }

  /** Message prêt d'un code d'activation (forme affichée) pour cette personne. */
  message(recipient: Omit<SubscriberContact, 'status'>, code: string, expiresAt: Date): Handoff {
    return buildHandoff({
      purpose: 'activation',
      space: 'subscriber',
      code,
      expiresAt,
      recipient,
      appUrl: this.config.APP_PUBLIC_URL ?? 'http://localhost:3000',
    });
  }
}

export function assertAssociation(what: string): void {
  const context = currentContext();
  if (context?.space !== 'association' || !context.associationId) {
    throw new Error(`${what} : contexte d’une association attendu`);
  }
}
