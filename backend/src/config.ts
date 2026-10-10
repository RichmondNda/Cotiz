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
  /** Intervalle du relais outbox du worker (jobs.yaml : chaque seconde) ; 0 le désactive (tests). */
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(0).max(60_000).default(1_000),
});

const ConfigSchemaChecked = ConfigSchema.superRefine((config, ctx) => {
  if (config.NODE_ENV !== 'production') return;
  for (const key of ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'CLAMAV_URL'] as const) {
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
