import { type DynamicModule, Module } from '@nestjs/common';
import type { Config } from '../config.js';
import { ConfigModule } from '../config.module.js';
import { AccessCliModule } from '../modules/access/access-cli.module.js';
import { BillingCliModule } from '../modules/billing/billing-cli.module.js';
import { IdentityCliModule } from '../modules/identity/identity-cli.module.js';
import { MembersCliModule } from '../modules/members/members.public.js';
import { OnboardingCliModule } from '../modules/onboarding/onboarding-cli.module.js';
import { ProjectsCliModule } from '../modules/projects/projects-cli.module.js';
import { TenancyCliModule } from '../modules/tenancy/tenancy-cli.module.js';
import { CryptoModule } from '../shared/crypto/index.js';
import { createLogger, LoggingModule } from '../shared/logging/index.js';
import { TenantContextModule } from '../shared/tenant-context/index.js';

/** Contexte Nest des scripts d'exploitation (src/cli.ts) : configuration, journaux, base, cas d'usage. Pas de HTTP. */
@Module({})
export class CliModule {
  static register(config: Config): DynamicModule {
    return {
      module: CliModule,
      imports: [
        ConfigModule.register(config),
        LoggingModule.register(createLogger(config, { name: 'cli' })),
        TenantContextModule,
        CryptoModule,
        IdentityCliModule,
        AccessCliModule,
        TenancyCliModule,
        BillingCliModule,
        OnboardingCliModule,
        ProjectsCliModule,
        MembersCliModule,
      ],
    };
  }
}
