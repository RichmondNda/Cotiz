import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id, paramètres OWASP (architecture/03-auth.md) : m = 19 MiB, t = 2, p = 1. `algorithm: 2` = Argon2id
 * (énumération const de @node-rs/argon2, inaccessible avec verbatimModuleSyntax).
 */
const OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** Hachage des mots de passe et des codes : jamais stockés en clair. */
@Injectable()
export class SecretHasher {
  hash(secret: string): Promise<string> {
    return hash(secret, OPTIONS);
  }

  /** `false` pour un haché mal formé, jamais d'exception. */
  async verify(hashed: string, secret: string): Promise<boolean> {
    try {
      return await verify(hashed, secret);
    } catch {
      return false;
    }
  }
}
