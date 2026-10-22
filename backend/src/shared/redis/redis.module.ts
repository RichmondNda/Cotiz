import { AsyncLocalStorage } from 'node:async_hooks';
import { Global, Inject, Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CONFIG, type Config } from '../../config.js';

/** Attente maximale de la connexion au démarrage. */
const CONNECT_ON_START_MS = 2_000;

/**
 * Client Redis de l'api (limitation de débit, idempotence). Commandes bornées à 500 ms : Redis lent ou absent ne
 * doit jamais bloquer une requête (chaque usage décide alors : laisser passer ou refuser).
 */
@Injectable()
export class RedisClient implements OnModuleInit, OnModuleDestroy {
  readonly redis: Redis;
  private readonly logger = new Logger(RedisClient.name);

  constructor(@Inject(CONFIG) config: Config) {
    this.redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, commandTimeout: 500 });
    // Lié au contexte du démarrage : la connexion (lazyConnect) s'ouvre pendant une requête, dont ses erreurs et
    // reconnexions garderaient sinon le contexte (requestId, association, utilisateur d'une autre requête).
    this.redis.on(
      'error',
      AsyncLocalStorage.bind((error: Error) => {
        this.logger.warn(`redis : ${error.message}`);
      }),
    );
  }

  /**
   * Connexion ouverte au démarrage : ouverte par la première requête, elle entrerait dans le délai de 500 ms de la
   * commande (un endpoint limité refuserait alors en 429). Attente bornée ; Redis absent : on démarre quand même,
   * ioredis se reconnecte seul.
   */
  async onModuleInit(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.redis.connect(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('connexion au démarrage trop lente'));
          }, CONNECT_ON_START_MS);
        }),
      ]);
    } catch (error) {
      this.logger.warn(`redis : ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

@Global()
@Module({ providers: [RedisClient], exports: [RedisClient] })
export class RedisModule {}
