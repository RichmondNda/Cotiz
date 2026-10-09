import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { RequestInfoMiddleware } from './request-info.middleware.js';

/** Informations de chaque requête HTTP (identifiant, IP, user-agent, rôle de l'acteur). */
@Global()
@Module({})
export class RequestInfoModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestInfoMiddleware).forRoutes('{*path}');
  }
}
