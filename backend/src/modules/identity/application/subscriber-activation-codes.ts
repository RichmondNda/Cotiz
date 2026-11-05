import { Injectable } from '@nestjs/common';
import type { ActivationCodeEntry } from '@cotiz/contracts';
import { oneTimeCodes, users } from '@cotiz/db';
import { and, count, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { isSubscriberOf } from '../../access/access.public.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { MAX_CODE_ATTEMPTS } from '../domain/one-time-code.js';
import { CodeService } from './code-service.js';
import { assertAssociation, SubscriberAccounts } from './subscriber-accounts.js';

type Entry = z.infer<typeof ActivationCodeEntry>;
type Pending = ReturnType<typeof pendingCodes>;

/** Position dans la liste : date d'émission (texte PostgreSQL, sans perte) et identifiant du code. */
export interface CodePosition {
  at: string;
  id: string;
}

export interface CodesPage {
  entries: Entry[];
  /** Position du dernier élément s'il y a une page suivante. */
  next: CodePosition | null;
  total: number;
}

/**
 * « Codes à remettre » (mb.codes, Q6) : comptes non activés et le dernier code d'activation émis par l'association
 * (RLS tenant_manage), dans la transaction de l'appelant. Un code consommé, ou remplacé par un code plus récent de
 * l'association, n'y est plus ; le code en clair n'est lisible que tant qu'il sert (`live`).
 */
@Injectable()
export class SubscriberActivationCodes {
  constructor(
    private readonly codes: CodeService,
    private readonly accounts: SubscriberAccounts,
  ) {}

  /** Les plus récents d'abord ; `handed` : marqués « remis » ou non. */
  async page(
    query: { handed?: boolean | undefined; after: CodePosition | null; limit: number },
    now = new Date(),
  ): Promise<CodesPage> {
    const { latest, filter } = pendingCodes();
    const handed =
      query.handed === undefined ? undefined : query.handed ? isNotNull(latest.handedAt) : isNull(latest.handedAt);
    const after = query.after
      ? sql`(${latest.createdAt}, ${latest.id}) < (${query.after.at}::timestamptz, ${query.after.id}::uuid)`
      : undefined;
    const tx = currentTx();
    const rows = await this.select(latest, and(filter, handed, after))
      .orderBy(desc(latest.createdAt), desc(latest.id))
      .limit(query.limit + 1);
    const [totals] = await tx
      .with(latest)
      .select({ n: count() })
      .from(latest)
      .innerJoin(users, eq(users.id, latest.userId))
      .where(and(filter, handed));
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      entries: await Promise.all(page.map((row) => this.entry(row, now))),
      next: rows.length > query.limit && last ? { at: last.at, id: last.id } : null,
      total: totals?.n ?? 0,
    };
  }

  /**
   * Nombre de codes de la liste (tableau de bord, « comptes non activés ») ; `handed` : marqués « remis » ou non.
   * Compte seulement : aucun code n'est déchiffré (as.dashboard est ouvert aux rôles sans `members.manage`).
   */
  count(query: { handed?: boolean | undefined } = {}): Promise<number> {
    return activationCodesCountOf(query);
  }

  /** Codes d'activation émis par l'association pour cette personne (frise), consommés et remplacés compris. */
  async codeIdsOf(userId: string): Promise<string[]> {
    assertAssociation('SubscriberActivationCodes.codeIdsOf');
    const rows = await currentTx()
      .select({ id: oneTimeCodes.id })
      .from(oneTimeCodes)
      .where(and(eq(oneTimeCodes.userId, userId), eq(oneTimeCodes.purpose, 'activation')));
    return rows.map((row) => row.id);
  }

  /** Le code s'il est encore dans la liste ; `null` sinon (consommé, remplacé, autre association). */
  async find(codeId: string, now = new Date()): Promise<Entry | null> {
    const { latest, filter } = pendingCodes();
    const [row] = await this.select(latest, and(filter, eq(latest.id, codeId))).limit(1);
    return row ? this.entry(row, now) : null;
  }

  /** Marque « remis » un code de la liste ; `first` : marqué par cet appel (et non déjà remis). `null` hors liste. */
  async markHanded(codeId: string, now = new Date()): Promise<{ entry: Entry; first: boolean } | null> {
    if (!(await this.find(codeId, now))) return null;
    const marked = await currentTx()
      .update(oneTimeCodes)
      .set({ handedAt: now })
      .where(and(eq(oneTimeCodes.id, codeId), isNull(oneTimeCodes.handedAt)))
      .returning({ id: oneTimeCodes.id });
    const entry = await this.find(codeId, now);
    return entry ? { entry, first: marked.length === 1 } : null;
  }

  private select(latest: Pending['latest'], where: SQL | undefined) {
    return currentTx()
      .with(latest)
      .select({
        id: latest.id,
        at: sql<string>`${latest.createdAt}::text`,
        createdAt: latest.createdAt,
        expiresAt: latest.expiresAt,
        attempts: latest.attempts,
        handedAt: latest.handedAt,
        member: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phoneE164,
          email: users.email,
        },
      })
      .from(latest)
      .innerJoin(users, eq(users.id, latest.userId))
      .where(where);
  }

  private async entry(
    row: {
      id: string;
      createdAt: Date;
      expiresAt: Date;
      attempts: number;
      handedAt: Date | null;
      member: Entry['member'];
    },
    now: Date,
  ): Promise<Entry> {
    const state = row.attempts >= MAX_CODE_ATTEMPTS ? 'blocked' : row.expiresAt <= now ? 'expired' : ('live' as const);
    const code = state === 'live' ? await this.codes.reveal(row.id, now) : null;
    return {
      id: row.id,
      member: row.member,
      state,
      handoff: code ? this.accounts.message(row.member, code, row.expiresAt) : null,
      issuedAt: row.createdAt.toISOString(),
      handedAt: row.handedAt?.toISOString() ?? null,
    };
  }
}

/**
 * Dernier code d'activation de chaque personne émis par l'association ; filtre : non consommé, compte non activé,
 * personne encore souscriptrice de l'association.
 */
function pendingCodes() {
  assertAssociation('SubscriberActivationCodes');
  const associationId = currentContext()?.associationId ?? '';
  const tx = currentTx();
  const latest = tx.$with('latest').as(
    tx
      .selectDistinctOn([oneTimeCodes.userId], {
        id: oneTimeCodes.id,
        userId: oneTimeCodes.userId,
        createdAt: oneTimeCodes.createdAt,
        expiresAt: oneTimeCodes.expiresAt,
        attempts: oneTimeCodes.attempts,
        consumedAt: oneTimeCodes.consumedAt,
        handedAt: oneTimeCodes.handedAt,
      })
      .from(oneTimeCodes)
      // Défense en profondeur : la RLS ne laisse déjà voir que les codes de l'association.
      .where(and(eq(oneTimeCodes.purpose, 'activation'), eq(oneTimeCodes.associationId, associationId)))
      .orderBy(oneTimeCodes.userId, desc(oneTimeCodes.createdAt), desc(oneTimeCodes.id)),
  );
  // Souscripteur retiré de l'association : son code ne se remet plus d'ici (mb.resend lui répond 404).
  const filter = and(
    isNull(latest.consumedAt),
    eq(users.status, 'pending_activation'),
    isSubscriberOf(associationId, latest.userId),
  );
  return { latest, filter };
}

/**
 * Nombre de codes de « Codes à remettre » de l'association du contexte (tableau de bord, récapitulatif gestionnaire) ;
 * `handed` : marqués « remis » ou non. Compte seulement : aucun code n'est déchiffré.
 */
export async function activationCodesCountOf(query: { handed?: boolean | undefined } = {}): Promise<number> {
  const { latest, filter } = pendingCodes();
  const handed =
    query.handed === undefined ? undefined : query.handed ? isNotNull(latest.handedAt) : isNull(latest.handedAt);
  const [totals] = await currentTx()
    .with(latest)
    .select({ n: count() })
    .from(latest)
    .innerJoin(users, eq(users.id, latest.userId))
    .where(and(filter, handed));
  return totals?.n ?? 0;
}
