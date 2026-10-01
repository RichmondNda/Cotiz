import { type DynamicModule, Global, Module } from '@nestjs/common';
import { CONFIG, type Config } from './config.js';

/** Met la configuration validée à disposition de tous les modules (jeton `CONFIG`). */
@Global()
@Module({})
export class ConfigModule {
  static register(config: Config): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: CONFIG, useValue: config }],
      exports: [CONFIG],
    };
  }
}
