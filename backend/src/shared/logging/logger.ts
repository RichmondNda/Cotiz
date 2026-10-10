import { isSpanContextValid, trace } from '@opentelemetry/api';
import { type DestinationStream, type Logger, pino } from 'pino';
import type { Config } from '../../config.js';
import { currentRequestInfo } from '../request-info/index.js';
import { currentLogContext } from './log-context.js';
import { pseudonymize } from './pseudonym.js';
import { maskPhones, redact, serializeError } from './redaction.js';

export type { Logger } from 'pino';

/** Clé de pseudonymisation hors production (LOG_PSEUDONYM_KEY est exigée en production). */
const DEVELOPMENT_PSEUDONYM_KEY = 'cotiz-cle-de-developpement-non-secrete';

/** Jeton d'injection du logger racine du processus. */
export const ROOT_LOGGER = Symbol('ROOT_LOGGER');

export interface LoggerOptions {
  /** `api` ou `worker` : champ `service` de chaque ligne. */
  name: 'api' | 'worker';
  /** Flux de sortie (tests) ; sinon LOG_DESTINATION. */
  destination?: DestinationStream;
}

const underTest = () => process.env.VITEST !== undefined;

function destinationOf(config: Config): DestinationStream {
  const target = config.LOG_DESTINATION;
  const pretty = config.LOG_PRETTY ?? (config.NODE_ENV === 'development' && !underTest());
  if (pretty) {
    return pino.transport({
      target: 'pino-pretty',
      options: { destination: target === 'stdout' ? 1 : target, mkdir: true, translateTime: 'SYS:HH:MM:ss.l' },
    });
  }
  return pino.destination(target === 'stdout' ? 1 : { dest: target, mkdir: true });
}

/**
 * Champs de corrélation de chaque ligne : requête HTTP en cours (requestId), contexte de journal (association,
 * utilisateur pseudonymisé, tâche du worker), trace OpenTelemetry active (lot 0.6, étape 3). Seuls les champs connus
 * sont écrits.
 */
function correlation(pseudonymKey: string): Record<string, unknown> {
  const { userId, ...context } = currentLogContext() ?? {};
  const requestId = currentRequestInfo()?.requestId;
  const span = trace.getActiveSpan()?.spanContext();
  const fields: Record<string, unknown> = {
    ...context,
    requestId,
    userRef: userId ? pseudonymize(userId, pseudonymKey) : undefined,
    ...(span && isSpanContextValid(span) ? { traceId: span.traceId, spanId: span.spanId } : {}),
  };
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null));
}

/**
 * Logger racine (pino) : JSON sur la sortie standard, une ligne par événement, `pino-pretty` en local. Toute ligne
 * passe par `redact` (mot de passe, code, téléphone, jetons masqués à toute profondeur) ; les textes libres ont leurs
 * téléphones masqués ; une erreur n'est jamais écrite avec son message SQL ni ses propriétés libres.
 */
export function createLogger(config: Config, options: LoggerOptions): Logger {
  const pseudonymKey = config.LOG_PSEUDONYM_KEY ?? DEVELOPMENT_PSEUDONYM_KEY;
  return pino(
    {
      level: config.LOG_LEVEL ?? (underTest() ? 'silent' : 'info'),
      base: { service: options.name },
      timestamp: pino.stdTimeFunctions.isoTime,
      messageKey: 'msg',
      mixin: () => correlation(pseudonymKey),
      // La corrélation l'emporte sur l'objet journalisé : un `{ associationId }` ou `{ requestId }` passé par erreur
      // ne remplace jamais ceux du contexte.
      mixinMergeStrategy: (object, mixin) => ({ ...object, ...mixin }),
      formatters: {
        level: (label) => ({ level: label }),
        log: (object) => redact(object) as Record<string, unknown>,
        // Champs de `logger.child({...})` : masqués comme le reste.
        bindings: (bindings) => redact(bindings) as Record<string, unknown>,
      },
      // Remplace le sérialiseur standard de pino, qui recopie message et propriétés libres (requête SQL, paramètres).
      serializers: { err: (e: unknown) => (e instanceof Error ? serializeError(e) : e) },
      hooks: {
        logMethod(args, method) {
          const [first, ...rest] = args as unknown[];
          // `logger.error(err)` : pino prendrait le message de l'erreur (requête SQL pour Drizzle) comme `msg`.
          if (first instanceof Error) {
            const msg = typeof rest[0] === 'string' ? rest[0] : (serializeError(first).message ?? first.name);
            method.apply(this, [{ err: first }, maskPhones(msg)]);
            return;
          }
          const masked = args.map((arg: unknown) => (typeof arg === 'string' ? maskPhones(arg) : arg));
          method.apply(this, masked as Parameters<typeof method>);
        },
      },
    },
    options.destination ?? destinationOf(config),
  );
}
