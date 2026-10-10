import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module.js';
import { IDEMPOTENCY_STORE, RedisIdempotencyStore } from './idempotency.interceptor.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import { IfMatchInterceptor } from './if-match.interceptor.js';
import { COUNTER_STORE, RateLimitInterceptor, RedisCounterStore } from './rate-limit.interceptor.js';
import { IpRateLimitMiddleware } from './rate-limit.middleware.js';

/** Conventions HTTP : plafond par IP (middleware), intercepteurs (enregistrés globalement par AppModule), Redis. */
@Module({
  imports: [RedisModule],
  providers: [
    { provide: COUNTER_STORE, useClass: RedisCounterStore },
    { provide: IDEMPOTENCY_STORE, useClass: RedisIdempotencyStore },
    RateLimitInterceptor,
    IdempotencyInterceptor,
    IfMatchInterceptor,
  ],
  exports: [RateLimitInterceptor, IdempotencyInterceptor, IfMatchInterceptor],
})
export class HttpConventionsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(IpRateLimitMiddleware).forRoutes('{*path}');
  }
}
