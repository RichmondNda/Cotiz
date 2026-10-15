import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { oneTimeCodes } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { CODES_SECRET_BOX, type SecretBox } from '../../../shared/crypto/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import {
  CODE_RULES,
  type CodePurpose,
  displayCode,
  generateCode,
  MAX_CODE_ATTEMPTS,
  normalizeCode,
} from '../domain/one-time-code.js';
import { SecretHasher } from '../infra/secret-hasher.js';

export interface IssueCodeInput {
  userId: string;
  purpose: CodePurpose;
  /** Association émettrice (RLS) ; `null` si émis par la plateforme. */
  associationId: string | null;
  /** Personne qui génère le code ; `null` pour un script d'exploitation. */
  issuedBy: string | null;
  /** Ré-affichable par les gestionnaires jusqu'à consommation : activation d'un souscripteur seulement (lot 2.3). */
  redisplayable?: boolean;
}

export interface IssuedCode {
  id: string;
  /** Forme affichée (`K7M4-P9QX`, 6 chiffres) : à remettre à la personne, jamais journalisée. */
  code: string;
  expiresAt: Date;
}

/**
 * Résultat d'une vérification : l'appelant lève l'erreur APRÈS le COMMIT (l'essai compté doit être validé).
 * `already_used` : le code saisi est le dernier code, déjà consommé (preuve, ex. `already_activated`).
 * `uncounted` : aucun code utilisable de cet usage en base (absent ou consommé), l'essai n'a pu y être compté :
 * l'appelant le compte ailleurs, pour que too_many_attempts arrive au même essai qu'avec un vrai code.
 */
export type CodeCheck =
  | { ok: true; codeId: string }
  | {
      ok: false;
      problem: 'invalid_code' | 'code_expired' | 'too_many_attempts' | 'already_used';
      uncounted?: true;
    };

/** Données associées du chiffré : il ne se déchiffre que sur sa ligne. */
const sealContext = (codeId: string) => `one_time_codes:${codeId}`;

/**
 * Codes à usage unique remis par une personne (architecture/03-auth.md), dans la transaction du cas d'usage appelant :
 * - toujours hachés (argon2id) ; chiffrés (AES-256-GCM) seulement pour une activation ré-affichable ;
 * - émettre invalide les codes non consommés du même usage pour la même personne ;
 * - 5 essais par code, comptés sous verrou de ligne (des essais simultanés n'en ajoutent pas) ;
 * - jamais de code dans un journal ni dans une erreur.
 */
@Injectable()
export class CodeService {
  /** Haché d'un code que personne ne connaît : même coût de vérification sans code (aucune fuite d'existence). */
  private readonly decoyHash: Promise<string>;

  constructor(
    private readonly hasher: SecretHasher,
    @Inject(CODES_SECRET_BOX) private readonly box: SecretBox,
  ) {
    this.decoyHash = hasher.hash(randomBytes(16).toString('hex'));
  }

  async issue(input: IssueCodeInput, now = new Date()): Promise<IssuedCode> {
    const tx = currentTx();
    // Deux émissions simultanées pour la même personne et le même usage : la seconde attend et invalide la première.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`one_time_codes:${input.userId}:${input.purpose}`}, 0))`,
    );
    await tx
      .update(oneTimeCodes)
      .set({ expiresAt: now, codeEncrypted: null })
      .where(
        and(
          eq(oneTimeCodes.userId, input.userId),
          eq(oneTimeCodes.purpose, input.purpose),
          isNull(oneTimeCodes.consumedAt),
          gt(oneTimeCodes.expiresAt, now),
        ),
      );

    const id = newId();
    const code = generateCode(input.purpose);
    const expiresAt = new Date(now.getTime() + CODE_RULES[input.purpose].ttlMs);
    const redisplayable = input.redisplayable === true && input.purpose === 'activation';
    await tx.insert(oneTimeCodes).values({
      id,
      userId: input.userId,
      purpose: input.purpose,
      delivery: 'manual',
      codeHash: await this.hasher.hash(code),
      expiresAt,
      associationId: input.associationId,
      codeEncrypted: redisplayable ? this.box.seal(code, sealContext(id)) : null,
      issuedBy: input.issuedBy,
      // Heure réelle de l'insertion, après le verrou : `now()` (début de transaction) classerait une émission qui a
      // attendu avant celle qu'elle invalide, et « le dernier code » serait le mauvais.
      createdAt: sql`clock_timestamp()`,
    });
    return { id, code: displayCode(input.purpose, code), expiresAt };
  }

  /** Vérifie le code saisi contre le dernier code de cet usage ; `userId` `null` : personne inconnue. */
  async verify(
    input: { userId: string | null; purpose: CodePurpose; code: string },
    now = new Date(),
  ): Promise<CodeCheck> {
    const tx = currentTx();
    const [code] = input.userId
      ? await tx
          .select({
            id: oneTimeCodes.id,
            codeHash: oneTimeCodes.codeHash,
            attempts: oneTimeCodes.attempts,
            expiresAt: oneTimeCodes.expiresAt,
            consumedAt: oneTimeCodes.consumedAt,
          })
          .from(oneTimeCodes)
          .where(and(eq(oneTimeCodes.userId, input.userId), eq(oneTimeCodes.purpose, input.purpose)))
          .orderBy(desc(oneTimeCodes.createdAt), desc(oneTimeCodes.id))
          .limit(1)
          .for('update')
      : [];

    if (!code) {
      await this.hasher.verify(await this.decoyHash, input.code);
      return { ok: false, problem: 'invalid_code', uncounted: true };
    }
    if (code.consumedAt !== null) {
      // Même coût : comparé à son propre haché, il ne prouve que la connaissance du code déjà utilisé. Essai non compté
      // en base (le code ne sert plus) : l'appelant le compte, comme pour une personne sans code.
      const same = await this.hasher.verify(code.codeHash, normalizeCode(input.purpose, input.code));
      return { ok: false, problem: same ? 'already_used' : 'invalid_code', uncounted: true };
    }
    // Même coût que les autres branches : le temps de réponse ne dit pas si un code existe.
    if (code.attempts >= MAX_CODE_ATTEMPTS || code.expiresAt <= now) {
      await this.hasher.verify(await this.decoyHash, input.code);
      return { ok: false, problem: code.attempts >= MAX_CODE_ATTEMPTS ? 'too_many_attempts' : 'code_expired' };
    }

    if (await this.hasher.verify(code.codeHash, normalizeCode(input.purpose, input.code))) {
      return { ok: true, codeId: code.id };
    }
    const [counted] = await tx
      .update(oneTimeCodes)
      .set({ attempts: sql`${oneTimeCodes.attempts} + 1` })
      .where(eq(oneTimeCodes.id, code.id))
      .returning({ attempts: oneTimeCodes.attempts });
    return {
      ok: false,
      problem: (counted?.attempts ?? MAX_CODE_ATTEMPTS) >= MAX_CODE_ATTEMPTS ? 'too_many_attempts' : 'invalid_code',
    };
  }

  /** Consomme le code (et efface son chiffré) ; `false` s'il l'était déjà (deux consommations simultanées). */
  async consume(codeId: string, now = new Date()): Promise<boolean> {
    const consumed = await currentTx()
      .update(oneTimeCodes)
      .set({ consumedAt: now, codeEncrypted: null })
      .where(and(eq(oneTimeCodes.id, codeId), isNull(oneTimeCodes.consumedAt)))
      .returning({ id: oneTimeCodes.id });
    return consumed.length === 1;
  }

  /**
   * Code ré-affichable (forme affichée), tant qu'il n'est ni consommé, ni expiré, ni bloqué ; `null` sinon. Lève une erreur si le
   * chiffré n'est pas celui de cette ligne.
   */
  async reveal(codeId: string, now = new Date()): Promise<string | null> {
    const [code] = await currentTx()
      .select({
        purpose: oneTimeCodes.purpose,
        sealed: oneTimeCodes.codeEncrypted,
        expiresAt: oneTimeCodes.expiresAt,
        attempts: oneTimeCodes.attempts,
      })
      .from(oneTimeCodes)
      .where(and(eq(oneTimeCodes.id, codeId), isNull(oneTimeCodes.consumedAt)))
      .limit(1);
    // Un code expiré ou bloqué par ses 5 essais ne sert plus : rien à ré-afficher.
    if (!code?.sealed || code.expiresAt <= now || code.attempts >= MAX_CODE_ATTEMPTS) return null;
    return displayCode(code.purpose, this.box.open(code.sealed, sealContext(codeId)));
  }
}
