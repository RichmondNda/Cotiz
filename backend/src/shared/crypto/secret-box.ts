import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Chiffrement réversible des secrets à ré-afficher (architecture/02 : codes d'activation, secrets TOTP et de webhook),
 * AES-256-GCM. Format : version (1 octet) | IV (12) | étiquette (16) | chiffré. `context` (données associées, AAD) lie
 * le chiffré à sa ligne : recopié ailleurs, il ne se déchiffre plus.
 */
export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('SecretBox : clé AES-256 de 32 octets exigée');
  }

  seal(plaintext: string, context: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), encrypted]);
  }

  /** Lève une erreur si le chiffré est altéré, d'un autre contexte ou d'une autre clé. */
  open(sealed: Buffer, context: string): string {
    if (sealed.length < 1 + IV_BYTES + TAG_BYTES || sealed[0] !== VERSION) {
      throw new Error('SecretBox : chiffré illisible');
    }
    const iv = sealed.subarray(1, 1 + IV_BYTES);
    const tag = sealed.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(sealed.subarray(1 + IV_BYTES + TAG_BYTES)), decipher.final()]).toString(
      'utf8',
    );
  }
}
