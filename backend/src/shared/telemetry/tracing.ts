import type { Context } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation, ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  ParentBasedSampler,
  type ReadableSpan,
  SimpleSpanProcessor,
  type Span,
  type SpanExporter,
  type SpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import type { Config } from '../../config.js';
import { scrubSpanData } from './scrub.js';

/** Nettoie chaque span terminé (scrubSpanData) avant de le confier au processeur d'export. */
class ScrubbingSpanProcessor implements SpanProcessor {
  constructor(private readonly inner: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.inner.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    scrubSpanData(span);
    this.inner.onEnd(span);
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }
}

export interface Tracing {
  shutdown(): Promise<void>;
}

function processorFor(config: Config, exporter: SpanExporter | undefined): SpanProcessor | undefined {
  if (exporter) return new SimpleSpanProcessor(exporter);
  if (config.OTEL_TRACES_EXPORTER === 'console') return new SimpleSpanProcessor(new ConsoleSpanExporter());
  if (config.OTEL_TRACES_EXPORTER === 'otlp') {
    const endpoint = (config.OTEL_EXPORTER_OTLP_ENDPOINT ?? '').replace(/\/$/, '');
    return new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }));
  }
  return undefined;
}

/**
 * Traces OpenTelemetry (architecture/11) : HTTP entrant et sortant, Express, PostgreSQL, Redis ; les tâches BullMQ par
 * job-trace.ts. À démarrer avant le chargement de ces bibliothèques (`--import ./dist/telemetry.js`). Exportateur
 * `none` : les spans existent quand même (traceId dans les journaux), rien ne sort du processus. Jamais de requête SQL
 * avec ses valeurs, ni de commande Redis avec ses arguments, ni de query string (ScrubbingSpanProcessor).
 */
export function startTracing(config: Config, options: { service: 'api' | 'worker'; exporter?: SpanExporter }): Tracing {
  const processor = processorFor(config, options.exporter);
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: `cotiz-${options.service}`,
      [ATTR_SERVICE_VERSION]: config.APP_VERSION,
    }),
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(config.OTEL_TRACES_SAMPLER_RATIO) }),
    spanProcessors: processor ? [new ScrubbingSpanProcessor(processor)] : [],
  });
  // TraceContext seul : jamais la `baggage` d'un client (données libres) reprise, propagée ou écrite dans un job.
  provider.register({ propagator: new W3CTraceContextPropagator() });
  const unregister = registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new HttpInstrumentation({
        // Scrapes Prometheus (serveur interne) : pas une requête de l'api.
        ignoreIncomingRequestHook: (req) => req.url === '/metrics',
      }),
      new ExpressInstrumentation({ ignoreLayersType: [ExpressLayerType.MIDDLEWARE] }),
      new PgInstrumentation({ requireParentSpan: true, enhancedDatabaseReporting: false }),
      // Nom de la commande seulement : ses arguments citent des clés (IP de la limitation de débit) et des valeurs.
      new IORedisInstrumentation({ requireParentSpan: true, dbStatementSerializer: (command) => command }),
    ],
  });
  return {
    async shutdown() {
      unregister();
      await provider.shutdown();
    },
  };
}
