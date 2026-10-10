import { context, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { serializeError } from '../logging/index.js';

/** Contexte de trace W3C joint aux données d'un job (BullMQ n'a pas d'en-têtes de message). */
interface TraceCarrier {
  traceparent?: string;
  tracestate?: string;
}

/**
 * Données d'un job à ajouter, avec le contexte de trace actif (`traceparent`) : le traitement poursuivra la trace du
 * producteur. Hors span actif, les données sont inchangées. Les schémas des jobs (Zod) ignorent ces champs.
 */
export function withTraceContext<T extends object>(data: T): T & TraceCarrier {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  if (!carrier.traceparent) return data;
  // traceparent et tracestate seulement : rien d'autre du transporteur (baggage) n'est écrit dans Redis.
  return {
    ...data,
    traceparent: carrier.traceparent,
    ...(carrier.tracestate ? { tracestate: carrier.tracestate } : {}),
  };
}

/**
 * Traitement d'un job dans un span CONSUMER (`<file> process`), enfant du producteur si le job porte un
 * `traceparent`, sinon racine d'une nouvelle trace. Un échec est enregistré sans message SQL, puis relancé.
 */
export function traceJob<T>(
  queue: string,
  job: { id?: string | undefined; name: string; data: unknown },
  fn: () => Promise<T>,
): Promise<T> {
  const data = (job.data ?? {}) as Record<string, unknown>;
  const carrier: TraceCarrier = {};
  if (typeof data.traceparent === 'string') carrier.traceparent = data.traceparent;
  if (typeof data.tracestate === 'string') carrier.tracestate = data.tracestate;
  const parent = propagation.extract(ROOT_CONTEXT, carrier);
  const attributes = {
    'messaging.system': 'bullmq',
    'messaging.destination.name': queue,
    'messaging.operation.type': 'process',
    'messaging.message.id': job.id ?? '',
    'cotiz.job.name': job.name,
  };
  return trace
    .getTracer('cotiz')
    .startActiveSpan(`${queue} process`, { kind: SpanKind.CONSUMER, attributes }, parent, async (span) => {
      try {
        return await fn();
      } catch (error) {
        const safe = serializeError(error);
        span.recordException({ name: safe.type, message: safe.message ?? safe.type, stack: safe.stack.join('\n') });
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
}
