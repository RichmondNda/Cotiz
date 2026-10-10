import { type DynamicModule, Global, Module } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Registry } from 'prom-client';
import { CONFIG, type Config } from '../../config.js';
import { COLLECT_ERRORS } from './metric-names.js';
import { MetricsServer } from './metrics-server.js';

/** Port du serveur de métriques du processus : configuré, sinon 9464 / 9465 (0 sous vitest). */
export function metricsPort(config: Config, service: 'api' | 'worker'): number {
  const configured = service === 'api' ? config.API_METRICS_PORT : config.WORKER_METRICS_PORT;
  if (configured !== undefined) return configured;
  if (process.env.VITEST !== undefined) return 0;
  return service === 'api' ? 9464 : 9465;
}

/** Jeton du registre Prometheus du processus (jamais le registre global de prom-client : un par application). */
export const METRICS_REGISTRY = Symbol('METRICS_REGISTRY');

/**
 * Registre du processus (métriques du processus et de Node, étiquetées `service`) et son serveur interne
 * (API_METRICS_PORT ou WORKER_METRICS_PORT). Les métriques s'y enregistrent à leur création.
 */
@Global()
@Module({})
export class MetricsModule {
  static register(service: 'api' | 'worker'): DynamicModule {
    return {
      module: MetricsModule,
      providers: [
        {
          provide: METRICS_REGISTRY,
          useFactory: () => {
            const registry = new Registry();
            registry.setDefaultLabels({ service });
            collectDefaultMetrics({ register: registry });
            return registry;
          },
        },
        {
          provide: MetricsServer,
          inject: [METRICS_REGISTRY, CONFIG],
          useFactory: (registry: Registry, config: Config) =>
            new MetricsServer(registry, {
              host: config.METRICS_HOST,
              port: metricsPort(config, service),
            }),
        },
      ],
      exports: [METRICS_REGISTRY, MetricsServer],
    };
  }
}

/** Échecs de collecte d'une jauge (Redis, PostgreSQL indisponibles), par collecteur ; partagé dans le registre. */
export function collectErrors(registry: Registry): Counter<'collector'> {
  const existing = registry.getSingleMetric(COLLECT_ERRORS);
  if (existing) return existing as Counter<'collector'>;
  return new Counter({
    name: COLLECT_ERRORS,
    help: 'Échecs de collecte des métriques, par collecteur',
    labelNames: ['collector'],
    registers: [registry],
  });
}
