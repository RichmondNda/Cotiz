import { type CanActivate, type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import type { Config } from './config.js';
import { ConfigModule } from './config.module.js';
import { ApiDocsModule } from './modules/docs/api-docs.module.js';
import { AccessModule } from './modules/access/access.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { MembershipGuard } from './modules/access/http/membership.guard.js';
import { PermissionGuard } from './modules/access/http/permission.guard.js';
import { SpaceGuard } from './modules/access/http/space.guard.js';
import { FilesModule } from './modules/files/files.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { LedgerModule } from './modules/ledger/ledger.public.js';
import { MembersModule } from './modules/members/members.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { ContractsModule } from './modules/contracts/contracts.public.js';
import { ImportsModule } from './modules/imports/imports.public.js';
import { ReportingModule } from './modules/reporting/reporting.module.js';
import { TenancyModule } from './modules/tenancy/tenancy.module.js';
import { JwtGuard } from './modules/identity/identity.public.js';
import { DebugModule } from './modules/system/http/debug.controller.js';
import { SystemModule } from './modules/system/system.module.js';
import { ContractSpaceGuard, HttpConventionsModule, ProblemFilter } from './shared/http/index.js';
import { IdempotencyInterceptor } from './shared/http/idempotency.interceptor.js';
import { IfMatchInterceptor } from './shared/http/if-match.interceptor.js';
import { RateLimitInterceptor } from './shared/http/rate-limit.interceptor.js';
import { AccessLogModule, createLogger, type Logger, LoggingModule } from './shared/logging/index.js';
import { HttpMetricsModule, MetricsModule } from './shared/metrics/index.js';
import { OutboxModule } from './shared/outbox/index.js';
import { RequestInfoModule } from './shared/request-info/index.js';
import { CryptoModule } from './shared/crypto/index.js';
import { StorageModule } from './shared/storage/index.js';
import { TelemetryModule } from './shared/telemetry/index.js';
import { TenantContextInterceptor, TenantContextModule } from './shared/tenant-context/index.js';

// Module racine de l'api. Les modules métier s'y ajoutent lot par lot.
@Module({})
export class AppModule {
  /**
   * `logger` : logger racine (tests qui lisent les journaux) ; sinon créé depuis la configuration.
   * `guards` : TESTS SEULEMENT, remplace la chaîne d'authentification et d'accès (garde de test qui pose le contexte
   * depuis des en-têtes, pour éprouver des espaces que les vraies gardes n'ouvrent pas encore).
   */
  static register(config: Config, options: { logger?: Logger; guards?: Type<CanActivate>[] } = {}): DynamicModule {
    if (options.guards && config.NODE_ENV === 'production') {
      throw new Error('AppModule : la chaîne des gardes ne se remplace que dans les tests');
    }
    // Gardes globales, dans cet ordre (architecture/02) : espace auth / public des endpoints sans acteur, jeton
    // d'accès, espace du jeton, appartenance, permission du contrat (@Can).
    const guards: Provider[] = options.guards
      ? options.guards.map((guard) => ({ provide: APP_GUARD, useClass: guard }))
      : [JwtGuard, SpaceGuard, MembershipGuard, PermissionGuard].map((guard) => ({
          provide: APP_GUARD,
          useExisting: guard,
        }));
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        LoggingModule.register(options.logger ?? createLogger(config, { name: 'api' })),
        MetricsModule.register('api'),
        TelemetryModule.register('api'),
        RequestInfoModule,
        AccessLogModule,
        HttpMetricsModule,
        HttpConventionsModule,
        TenantContextModule,
        OutboxModule,
        StorageModule,
        CryptoModule,
        SystemModule,
        FilesModule,
        IdentityModule,
        BillingModule,
        AccessModule,
        OnboardingModule,
        TenancyModule,
        ProjectsModule,
        ContractsModule,
        ImportsModule,
        MembersModule,
        LedgerModule,
        NotificationsModule,
        ReportingModule,
        // Documentation interne (Scalar) : jamais en production.
        ...(config.NODE_ENV === 'production' ? [] : [ApiDocsModule]),
        // Erreur provoquée (démonstration de l'observabilité) : en développement seulement.
        ...(config.NODE_ENV === 'development' ? [DebugModule] : []),
      ],
      // Intercepteurs globaux, dans cet ordre : débit et idempotence avant toute transaction (la réponse mémorisée
      // l'est après le COMMIT), puis If-Match/ETag, puis la transaction de contexte (sauf @WithoutTenantContext()).
      providers: [
        { provide: APP_GUARD, useClass: ContractSpaceGuard },
        ...guards,
        { provide: APP_INTERCEPTOR, useExisting: RateLimitInterceptor },
        { provide: APP_INTERCEPTOR, useExisting: IdempotencyInterceptor },
        { provide: APP_INTERCEPTOR, useExisting: IfMatchInterceptor },
        { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
        { provide: APP_FILTER, useClass: ProblemFilter },
      ],
    };
  }
}
