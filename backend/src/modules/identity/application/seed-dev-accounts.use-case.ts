import { Inject, Injectable } from '@nestjs/common';
import { credentials, users } from '@cotiz/db';
import { eq, or } from 'drizzle-orm';
import { CONFIG, type Config } from '../../../config.js';
import { grantPlatformRole, platformRoleOf } from '../../access/access.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { assertDevSeedAllowed, mockId, SeedRefusedError } from '../../../shared/dev-seed/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { SecretHasher } from '../infra/secret-hasher.js';
import { CodeService } from './code-service.js';

/**
 * Mot de passe des comptes de développement : connu de tous (frontend/server/mocks/IDENTIFIANTS.md, script de capture,
 * parcours e2e). Jamais en production : la commande y est refusée.
 */
export const DEV_PASSWORD = 'Plateau-Dev-Cotiz-2026';

interface DevAccount {
  /** Clé des données simulées du front (`uid('user', clé)`). */
  key: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  platformRole?: 'owner';
  /**
   * `pending_activation` : sans mot de passe, un code d'activation à remettre (première connexion). `disabled` : personne
   * du jeu de référence qui n'a pas à se connecter (relecteur de paiements de seed-dev), sans mot de passe ni code.
   */
  status: 'active' | 'pending_activation' | 'disabled';
}

/**
 * Comptes réels de développement (docs/specs/seed-reference.yaml, clés de frontend/server/mocks/db/seed.ts) : un par
 * espace basculé, plus Fatou, compte non activé. Leurs appartenances : module access.
 */
const ACCOUNTS: readonly DevAccount[] = [
  {
    key: 'richy',
    email: 'richy@cotiz.app',
    phone: null,
    firstName: 'Richy',
    lastName: '',
    platformRole: 'owner',
    status: 'active',
  },
  {
    key: 'awa-kone',
    email: 'awa@entraide.ci',
    phone: '+2250708091011',
    firstName: 'Awa',
    lastName: 'Koné',
    status: 'active',
  },
  {
    key: 'moussa-diarra',
    email: null,
    phone: '+2250544218790',
    firstName: 'Moussa',
    lastName: 'Diarra',
    status: 'active',
  },
  {
    key: 'jean-kouassi',
    email: null,
    phone: '+2250755667788',
    firstName: 'Jean',
    lastName: 'Kouassi',
    status: 'active',
  },
  {
    key: 'ibrahim-toure',
    email: null,
    phone: '+2250100000001',
    firstName: 'Ibrahim',
    lastName: 'Touré',
    status: 'active',
  },
  {
    key: 'fatou-traore',
    email: null,
    phone: '+2250122334455',
    firstName: 'Fatou',
    lastName: 'Traoré',
    status: 'pending_activation',
  },
  // Relecteurs des paiements de référence (lot 2.4) : Aminata, gestionnaire retirée d'Entraide ; le responsable de Man.
  {
    key: 'aminata-konate',
    email: 'aminata.konate@entraide-yopougon.ci',
    phone: null,
    firstName: 'Aminata',
    lastName: 'Konaté',
    status: 'disabled',
  },
  { key: 'responsable-man', email: null, phone: null, firstName: '[Responsable]', lastName: '', status: 'disabled' },
];

/** Compte prêt : mot de passe connu, ou code d'activation à remettre. */
export type SeededAccount =
  | { identifier: string; password: string }
  | { identifier: string; name: string; activationCode: string; expiresAt: Date };

export { SeedRefusedError } from '../../../shared/dev-seed/index.js';

/**
 * CLI `seed-dev` (lots 1.1, 1.2) : comptes à mot de passe connu pour se connecter en local au vrai back, au même
 * identifiant que les données simulées. Idempotente : mot de passe, statut et rôle remis à l'identique ; un compte non
 * activé reçoit un nouveau code (l'ancien expire). Refusée hors développement et test, sans COTIZ_DEV_SEED=1, et sur un
 * compte qu'elle n'a pas créé (même email ou même téléphone).
 */
@Injectable()
export class SeedDevAccountsUseCase {
  constructor(
    private readonly hasher: SecretHasher,
    private readonly codes: CodeService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Audited('platform_staff.seed_dev')
  async execute(): Promise<SeededAccount[]> {
    assertDevSeedAllowed(this.config);
    const tx = currentTx();
    const passwordHash = await this.hasher.hash(DEV_PASSWORD);
    const seeded: SeededAccount[] = [];
    for (const account of ACCOUNTS) {
      // Jamais un compte que la commande n'a pas créé (create-platform-owner, inscription…) : son mot de passe serait
      // remplacé par une valeur publique.
      const id = mockId('user', account.key);
      const identifiers = [
        ...(account.email ? [eq(users.email, account.email)] : []),
        ...(account.phone ? [eq(users.phoneE164, account.phone)] : []),
      ];
      // Sans identifiant, `or()` serait vide et lirait toute la table : erreur de la liste ACCOUNTS (sauf compte
      // désactivé, qui ne se connecte jamais).
      if (identifiers.length === 0 && account.status !== 'disabled') {
        throw new Error(`Compte de seed-dev ${account.key} sans email ni téléphone`);
      }
      const existing =
        identifiers.length === 0
          ? []
          : await tx
              .select({ id: users.id })
              .from(users)
              .where(or(...identifiers));
      const identifier = account.email ?? account.phone ?? account.key;
      if (existing.some((row) => row.id !== id)) {
        // La clé du compte, jamais son email ou son téléphone : le message peut finir dans un journal.
        throw new SeedRefusedError(`Compte ${account.key} : existe déjà, créé autrement que par seed-dev, non modifié`);
      }
      const active = account.status === 'active';
      const identity = {
        email: account.email,
        phoneE164: account.phone,
        firstName: account.firstName,
        lastName: account.lastName,
        status: account.status,
        mustChangePassword: !active,
      };
      await tx
        .insert(users)
        .values({ id, ...identity })
        .onConflictDoUpdate({ target: users.id, set: identity });
      if (account.status === 'disabled') {
        recordAudit({
          entityType: 'user',
          entityId: id,
          associationId: null,
          after: { key: account.key, status: account.status, seed: 'dev' },
        });
        continue;
      }
      const secret = active
        ? { passwordHash, passwordChangedAt: new Date(), failedAttempts: 0, lockedUntil: null }
        : { passwordHash: null, passwordChangedAt: null, failedAttempts: 0, lockedUntil: null };
      await tx
        .insert(credentials)
        .values({ userId: id, ...secret })
        .onConflictDoUpdate({ target: credentials.userId, set: secret });
      if (account.platformRole && (await platformRoleOf(id)) === null)
        await grantPlatformRole(id, account.platformRole);
      if (active) {
        seeded.push({ identifier, password: DEV_PASSWORD });
      } else {
        const issued = await this.codes.issue({
          userId: id,
          purpose: 'activation',
          associationId: null,
          issuedBy: null,
        });
        seeded.push({
          identifier,
          name: `${account.firstName} ${account.lastName}`,
          activationCode: issued.code,
          expiresAt: issued.expiresAt,
        });
      }
      recordAudit({
        entityType: 'user',
        entityId: id,
        associationId: null,
        after: { key: account.key, status: account.status, seed: 'dev' },
      });
    }
    return seeded;
  }
}
