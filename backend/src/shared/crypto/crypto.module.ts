import { Global, Logger, Module } from '@nestjs/common';
import { CONFIG, type Config } from '../../config.js';
import { SecretBox } from './secret-box.js';

/** Clé de développement : CODES_ENCRYPTION_KEY est exigée en production (config.ts). */
const DEVELOPMENT_KEY = Buffer.from('cotiz-developpement-codes-cle-32', 'utf8');

/** Chiffrement des codes d'activation ré-affichables (one_time_codes.code_encrypted). */
export const CODES_SECRET_BOX = Symbol('CODES_SECRET_BOX');

@Global()
@Module({
  providers: [
    {
      provide: CODES_SECRET_BOX,
      inject: [CONFIG],
      useFactory: (config: Config) => {
        if (config.CODES_ENCRYPTION_KEY !== undefined) {
          return new SecretBox(Buffer.from(config.CODES_ENCRYPTION_KEY, 'base64'));
        }
        new Logger('CryptoModule').warn('clé de chiffrement des codes de développement (CODES_ENCRYPTION_KEY absente)');
        return new SecretBox(DEVELOPMENT_KEY);
      },
    },
  ],
  exports: [CODES_SECRET_BOX],
})
export class CryptoModule {}
