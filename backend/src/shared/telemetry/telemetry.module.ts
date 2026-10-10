import { type DynamicModule, Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { CONFIG, type Config } from '../../config.js';
import { ErrorReporter } from './error-reporter.js';

/** Rapports d'erreurs du processus (GlitchTip, inactif sans DSN). Le traçage démarre avant Nest (src/telemetry.ts). */
@Global()
@Module({})
export class TelemetryModule implements OnModuleDestroy {
  constructor(@Inject(ErrorReporter) private readonly reporter: ErrorReporter) {}

  static register(service: 'api' | 'worker'): DynamicModule {
    return {
      module: TelemetryModule,
      providers: [
        {
          provide: ErrorReporter,
          inject: [CONFIG],
          useFactory: (config: Config) => new ErrorReporter(config, { service }),
        },
      ],
      exports: [ErrorReporter],
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.reporter.flush();
  }
}
