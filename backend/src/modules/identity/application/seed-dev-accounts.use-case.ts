import { Inject, Injectable } from '@nestjs/common';
import { credentials, users } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import { CONFIG, type Config } from '../../../config.js';
import { grantPlatformRole, platformRoleOf } from '../../access/access.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { assertDevSeedAllowed, mockId, SeedRefusedError } from '../../../shared/dev-seed/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { SecretHasher } from '../infra/secret-hasher.js';

/**
 * Mot de passe des comptes de développement : connu de tous (frontend/server/mocks/IDENTIFIANTS.md, script de capture,
 * parcours e2e). Jamais en production : la commande y est refusée.
 */
export const DEV_PASSWORD = 'Plateau-Dev-Cotiz-2026';

/** Comptes réels de développement (docs/specs/seed-reference.yaml) : ceux des espaces déjà basculés. */
const ACCOUNTS = [
  { key: 'richy', email: 'richy@cotiz.app', firstName: 'Richy', lastName: '', platformRole: 'owner' },
] as const;

export { SeedRefusedError } from '../../../shared/dev-seed/index.js';

/**
 * CLI `seed-dev` (lot 1.1) : comptes actifs à mot de passe connu pour se connecter en local au vrai back (espace
 * plateforme basculé), au même identifiant que les données simulées. Idempotente : mot de passe et rôle remis à
 * l'identique. Refusée hors développement et test, sans COTIZ_DEV_SEED=1, et sur un compte qu'elle n'a pas créé.
 */
@Injectable()
export class SeedDevAccountsUseCase {
  constructor(
    private readonly hasher: SecretHasher,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Audited('platform_staff.seed_dev')
  async execute(): Promise<{ email: string; password: string }[]> {
    assertDevSeedAllowed(this.config);
    const tx = currentTx();
    const passwordHash = await this.hasher.hash(DEV_PASSWORD);
    for (const account of ACCOUNTS) {
      // Jamais un compte que la commande n'a pas créé (create-platform-owner…) : son mot de passe serait remplacé par
      // une valeur publique.
      const id = mockId('user', account.key);
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, account.email)).limit(1);
      if (existing && existing.id !== id) {
        throw new SeedRefusedError(`${account.email} existe déjà, créé autrement que par seed-dev : non modifié`);
      }
      const identity = { email: account.email, firstName: account.firstName, lastName: account.lastName };
      await tx
        .insert(users)
        .values({ id, ...identity, status: 'active', mustChangePassword: false })
        .onConflictDoUpdate({ target: users.id, set: { ...identity, status: 'active', mustChangePassword: false } });
      const secret = { passwordHash, passwordChangedAt: new Date(), failedAttempts: 0, lockedUntil: null };
      await tx
        .insert(credentials)
        .values({ userId: id, ...secret })
        .onConflictDoUpdate({ target: credentials.userId, set: secret });
      if ((await platformRoleOf(id)) === null) await grantPlatformRole(id, account.platformRole);
      recordAudit({
        entityType: 'user',
        entityId: id,
        associationId: null,
        after: { email: account.email, seed: 'dev' },
      });
    }
    return ACCOUNTS.map((account) => ({ email: account.email, password: DEV_PASSWORD }));
  }
}
