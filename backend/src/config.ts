import { createPrivateKey, createPublicKey } from 'node:crypto';
import { z } from 'zod';
import { parseIpAllowList } from './shared/net/ip-allow-list.js';

/** PEM sur une ligne (`\n` littéraux, fréquent dans les gestionnaires de secrets) → PEM multiligne. */
const Pem = z
  .string()
  .min(1)
  .transform((value) => value.replaceAll('\\n', '\n'))
  .optional();

/** Paire Ed25519 cohérente (la clé publique est celle de la clé privée). */
function isEd25519Pair(privatePem: string, publicPem: string): boolean {
  try {
    const privateKey = createPrivateKey(privatePem);
    const derived = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    return (
      privateKey.asymmetricKeyType === 'ed25519' &&
      derived.equals(createPublicKey(publicPem).export({ type: 'spki', format: 'der' }))
    );
  } catch {
    return false;
  }
}

// Configuration validée au démarrage : une variable manquante ou invalide arrête le processus.
// Les messages nomment les variables, jamais leurs valeurs (elles peuvent contenir des secrets).
/** Schéma des variables d'environnement (exporté pour le test « sans fournisseur », lot 3.5). */
export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  /** Via PgBouncer (mode transaction) pour l'api et le worker. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Connexions du pool du processus (shared/tenant-context), une transaction de contexte chacune. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /**
   * Rôle cotiz_platform (BYPASSRLS) : routes /platform de l'api et scripts de l'espace platform seulement
   * (architecture/02). Exigée en production ; absente ailleurs, ces routes et scripts échouent.
   */
  PLATFORM_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  /** Connexions du pool plateforme (super-admin seulement). */
  PLATFORM_DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(3),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  /**
   * Adresse publique du front (liens d'activation des messages prêts à transmettre) : exigée en production ; ailleurs,
   * le front de développement (http://localhost:3000).
   */
  APP_PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional(),
  /**
   * Clés Ed25519 des jetons d'accès (JWT EdDSA, architecture/03), en PEM (PKCS#8 et SPKI ; `\n` littéral accepté pour les
   * retours à la ligne) : exigées en production ; ailleurs, absentes, une paire éphémère est générée au démarrage (les
   * jetons ne survivent pas à un redémarrage).
   */
  JWT_PRIVATE_KEY: Pem,
  JWT_PUBLIC_KEY: Pem,
  /**
   * Connexion à l'espace plateforme : adresses ou réseaux autorisés (`203.0.113.7, 10.0.0.0/8`, IPv4 ou IPv6).
   * Absente : toute adresse (architecture/03 ; V2 : TOTP obligatoire, lot 4.7).
   */
  PLATFORM_ALLOWED_IPS: z.string().min(1).optional(),
  /**
   * Clé AES-256 (32 octets en base64) des codes d'activation ré-affichables (one_time_codes.code_encrypted) : exigée en
   * production ; ailleurs, une clé de développement fixe.
   */
  CODES_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32 && /^[A-Za-z0-9+/]+={0,2}$/.test(value), {
      message: '32 octets en base64 attendus',
    })
    .optional(),
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
  /** Gotenberg (Chromium) pour les PDF de la file `documents` (architecture/08), ex. http://gotenberg:3000 : exigé en
   * production pour le worker. Sans lui, un PDF reste en attente (jamais produit par défaut). */
  GOTENBERG_URL: z.url({ protocol: /^https?$/ }).optional(),
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
  /**
   * Clé HMAC des défis ALTCHA auto-hébergés du formulaire de demande (décision n° 12) : exigée en production ;
   * ailleurs, absente, une clé éphémère est tirée au démarrage (un défi ne survit pas à un redémarrage).
   */
  ALTCHA_HMAC_KEY: z.string().min(32).optional(),
  /** Coût PBKDF2 d'un essai du défi ALTCHA (difficulté pour le navigateur ; les tests le baissent). */
  ALTCHA_COST: z.coerce.number().int().min(1).default(5000),
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
  /**
   * CLI `seed-dev` (comptes de développement au mot de passe connu) : accord explicite, en plus de NODE_ENV
   * development ou test. Jamais en recette ni en production.
   */
  COTIZ_DEV_SEED: z.stringbool().default(false),
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
  if ((config.JWT_PRIVATE_KEY === undefined) !== (config.JWT_PUBLIC_KEY === undefined)) {
    const missing = config.JWT_PRIVATE_KEY === undefined ? 'JWT_PRIVATE_KEY' : 'JWT_PUBLIC_KEY';
    ctx.addIssue({ code: 'custom', path: [missing], message: 'exigée avec la seconde clé de la paire' });
  } else if (
    config.JWT_PRIVATE_KEY !== undefined &&
    config.JWT_PUBLIC_KEY !== undefined &&
    !isEd25519Pair(config.JWT_PRIVATE_KEY, config.JWT_PUBLIC_KEY)
  ) {
    ctx.addIssue({ code: 'custom', path: ['JWT_PRIVATE_KEY'], message: 'paire Ed25519 attendue' });
  }
  if (config.PLATFORM_ALLOWED_IPS !== undefined && parseIpAllowList(config.PLATFORM_ALLOWED_IPS) === null) {
    ctx.addIssue({ code: 'custom', path: ['PLATFORM_ALLOWED_IPS'], message: 'adresse ou réseau invalide' });
  }
  if (config.NODE_ENV !== 'production') return;
  for (const key of [
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'CLAMAV_URL',
    'GOTENBERG_URL',
    'LOG_PSEUDONYM_KEY',
    'APP_PUBLIC_URL',
    'JWT_PRIVATE_KEY',
    'JWT_PUBLIC_KEY',
    'CODES_ENCRYPTION_KEY',
    'PLATFORM_DATABASE_URL',
    'ALTCHA_HMAC_KEY',
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
