import { type DynamicModule, Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AccessLogMiddleware } from './access-log.middleware.js';
import { type Logger, ROOT_LOGGER } from './logger.js';
import { PinoNestLogger } from './nest-logger.js';

/** Logger racine du processus (jeton ROOT_LOGGER) et adaptateur du `Logger` de Nest. */
@Global()
@Module({})
export class LoggingModule {
  static register(logger: Logger): DynamicModule {
    return {
      module: LoggingModule,
      providers: [{ provide: ROOT_LOGGER, useValue: logger }, PinoNestLogger],
      exports: [ROOT_LOGGER, PinoNestLogger],
    };
  }
}

/** Ligne d'accès de chaque requête HTTP (api seulement). Après RequestInfoModule : le requestId est posé. */
@Module({})
export class AccessLogModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AccessLogMiddleware).forRoutes('{*path}');
  }
}
