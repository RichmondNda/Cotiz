import { trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';
import type { Config } from '../../config.js';
import { redact, serializeError } from '../logging/index.js';
import { currentRequestInfo } from '../request-info/index.js';

/**
 * Aucune donnée collectée automatiquement par le SDK (Sentry 11 collecte tout par défaut) : ni utilisateur, ni
 * cookies, en-têtes, corps, query string, données SQL, arguments de file, variables ou lignes de code source.
 */
const NO_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 0,
} satisfies Sentry.NodeOptions['dataCollection'];

/** Événement envoyé : ni requête (corps, en-têtes, cookies, IP), ni utilisateur, ni fil d'Ariane. */
function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  delete event.server_name;
  if (event.extra) event.extra = redact(event.extra) as Record<string, unknown>;
  return event;
}

/**
 * Rapports d'erreurs vers GlitchTip (SDK Sentry, auto-hébergé ; architecture/11). Sans GLITCHTIP_DSN : inactif, le SDK
 * n'est jamais initialisé, rien n'est envoyé. Avec : version déployée, requestId, traceId ; l'erreur est reconstruite
 * depuis sa forme journalisable (serializeError) — jamais un message SQL, ses paramètres ni ses propriétés libres.
 */
export class ErrorReporter {
  readonly enabled: boolean;

  constructor(
    config: Config,
    options: { service?: 'api' | 'worker'; transport?: Sentry.NodeOptions['transport'] } = {},
  ) {
    this.enabled = config.GLITCHTIP_DSN !== undefined;
    if (!this.enabled) return;
    Sentry.initWithoutDefaultIntegrations({
      dsn: config.GLITCHTIP_DSN,
      release: config.APP_VERSION,
      environment: config.NODE_ENV,
      dataCollection: NO_DATA_COLLECTION,
      integrations: [],
      ...(options.transport ? { transport: options.transport } : {}),
      initialScope: { tags: { service: options.service ?? 'api' } },
      beforeSend: scrubEvent,
      beforeBreadcrumb: () => null,
    });
  }

  /** Signale une erreur ; renvoie l'identifiant de l'événement, `undefined` si inactif. */
  capture(error: unknown, tags: Record<string, string> = {}): string | undefined {
    if (!this.enabled) return undefined;
    const serialized = serializeError(error);
    const safe = new Error(serialized.message ?? serialized.type);
    safe.name = serialized.type;
    safe.stack = [`${serialized.type}: ${safe.message}`, ...serialized.stack].join('\n');
    const requestId = currentRequestInfo()?.requestId;
    const span = trace.getActiveSpan()?.spanContext();
    const { sqlstate, table, constraint, column, routine } = serialized;
    return Sentry.captureException(safe, {
      tags: {
        ...(requestId ? { requestId } : {}),
        ...(span ? { traceId: span.traceId } : {}),
        ...tags,
      },
      extra: Object.fromEntries(
        Object.entries({ sqlstate, table, constraint, column, routine }).filter(([, v]) => v !== undefined),
      ),
    });
  }

  async flush(): Promise<void> {
    if (this.enabled) await Sentry.flush(2_000);
  }
}
