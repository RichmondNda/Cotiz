import { z } from 'zod';

// Configuration validée au démarrage : une variable manquante ou invalide arrête le processus.
// Les messages nomment les variables, jamais leurs valeurs (elles peuvent contenir des secrets).
const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  /** Via PgBouncer (mode transaction) pour l'api et le worker. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Connexions du pool du processus (shared/tenant-context), une transaction de contexte chacune. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  /**
   * Adresse publique du front (liens d'activation des messages prêts à transmettre) : exigée en production ; ailleurs,
   * le front de développement (http://localhost:3000).
   */
  APP_PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional(),
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
  /**
   * Adresse de MinIO vue par le navigateur, pour signer les URL de dépôt et de lecture (S3_ENDPOINT s'il est absent).
   * La signature porte sur l'hôte : elle doit être celle que le navigateur appelle.
   */
  S3_PUBLIC_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  /** Identifiants MinIO : exigés en production ; ailleurs, le stockage échoue à l'usage s'ils manquent. */
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** clamd en TCP (architecture/08), ex. tcp://clamav:3310 : exigé en production pour le worker. */
  CLAMAV_URL: z.url({ protocol: /^tcp$/ }).optional(),
  /** fl.upload › complete : attente du résultat de l'analyse avant de répondre `pending` (lot 0.5). */
  FILE_SCAN_WAIT_MS: z.coerce.number().int().min(0).max(30_000).default(5_000),
  /**
   * Nombre de proxys de confiance devant l'api (répartiteur, Traefik…) : l'IP du client est lue dans X-Forwarded-For
   * à cette profondeur. 0 : X-Forwarded-For ignoré. Jamais « tous » : le client choisirait son IP.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /** Limitation de débit, par minute (architecture/02) : par IP, par association, par utilisateur et endpoint. */
  RATE_LIMIT_IP_PER_MIN: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_ASSOCIATION_PER_MIN: z.coerce.number().int().min(1).default(600),
  RATE_LIMIT_ENDPOINT_PER_MIN: z.coerce.number().int().min(1).default(20),
  /** Intervalle du relais outbox du worker (jobs.yaml : chaque seconde) ; 0 le désactive (tests). */
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(0).max(60_000).default(1_000),
  /**
   * Métriques Prometheus (`GET /metrics`) : serveur HTTP interne de chaque processus, jamais sous /api/v1 ni derrière le
   * proxy public. 0 le désactive. Absent : 9464 (api) et 9465 (worker), désactivé sous vitest (les tests de métriques
   * le fixent). En conteneur, METRICS_HOST=0.0.0.0 sur le réseau interne seulement, port jamais publié (lot 7.1) :
   * le serveur n'a pas d'authentification.
   */
  API_METRICS_PORT: z.coerce.number().int().min(0).max(65_535).optional(),
  WORKER_METRICS_PORT: z.coerce.number().int().min(0).max(65_535).optional(),
  METRICS_HOST: z.string().min(1).default('127.0.0.1'),
  /**
   * Traces OpenTelemetry (lot 0.6) : `none` (par défaut : traceId dans les journaux, rien d'exporté), `console`
   * (local), `otlp` (Collector, raccordé au lot 7.1, OTEL_EXPORTER_OTLP_ENDPOINT exigée).
   */
  OTEL_TRACES_EXPORTER: z.enum(['none', 'console', 'otlp']).default('none'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  /**
   * Part des traces enregistrées à la source (1 = toutes). La politique d'architecture/11 (10 %, 100 % des erreurs) est
   * un échantillonnage en fin de trace, fait par le Collector (lot 7.1) : il faut lui envoyer toutes les traces.
   */
  OTEL_TRACES_SAMPLER_RATIO: z.coerce.number().min(0).max(1).default(1),
  /** GlitchTip (SDK Sentry, auto-hébergé) : absent, aucun SDK initialisé, aucun envoi. Raccordé au lot 7.1. */
  GLITCHTIP_DSN: z.url({ protocol: /^https?$/ }).optional(),
  /** Version déployée (étiquette de l'image) : traces et rapports d'erreur. */
  APP_VERSION: z.string().min(1).default('dev'),
  /** Niveau des journaux (pino). Absent : `info`, et `silent` sous vitest (les tests qui lisent les journaux le fixent). */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  /** Journaux lisibles (pino-pretty, dépendance de développement) au lieu du JSON. Absent : en développement seulement. */
  LOG_PRETTY: z.stringbool().optional(),
  /** `stdout` (par défaut) ou chemin d'un fichier. L'envoi vers Logstash (ELK) est raccordé au lot 7.1. */
  LOG_DESTINATION: z.string().min(1).default('stdout'),
  /**
   * Clé HMAC de pseudonymisation des utilisateurs dans les journaux (architecture/11) : exigée en production ; ailleurs,
   * une clé de développement fixe (les journaux locaux ne sont pas des données personnelles à protéger).
   */
  LOG_PSEUDONYM_KEY: z.string().min(32).optional(),
});

const ConfigSchemaChecked = ConfigSchema.superRefine((config, ctx) => {
  if (config.NODE_ENV === 'production' && config.OTEL_TRACES_EXPORTER === 'console') {
    // Les spans partiraient sur la sortie standard, donc dans les journaux (ELK).
    ctx.addIssue({ code: 'custom', path: ['OTEL_TRACES_EXPORTER'], message: 'console interdit en production' });
  }
  if (config.OTEL_TRACES_EXPORTER === 'otlp' && config.OTEL_EXPORTER_OTLP_ENDPOINT === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['OTEL_EXPORTER_OTLP_ENDPOINT'],
      message: 'exigée avec OTEL_TRACES_EXPORTER=otlp',
    });
  }
  if (config.NODE_ENV !== 'production') return;
  for (const key of [
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'CLAMAV_URL',
    'LOG_PSEUDONYM_KEY',
    'APP_PUBLIC_URL',
  ] as const) {
    if (config[key] === undefined) ctx.addIssue({ code: 'custom', path: [key], message: 'exigée en production' });
  }
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = ConfigSchemaChecked.safeParse(env);
  if (result.success) return result.data;
  const lines = result.error.issues.map((issue) => {
    const variable = issue.path.join('.');
    return (issue.code === 'invalid_type' || issue.code === 'custom') && env[variable] === undefined
      ? `- ${variable} : manquante`
      : `- ${variable} : invalide (${issue.message})`;
  });
  throw new ConfigError(`Configuration invalide :\n${lines.join('\n')}`);
}

/** Jeton d'injection de la configuration validée. */
export const CONFIG = Symbol('CONFIG');
