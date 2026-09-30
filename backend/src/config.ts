import { z } from 'zod';

// Configuration validée au démarrage : une variable manquante ou invalide arrête le processus.
// Les messages nomment les variables, jamais leurs valeurs (elles peuvent contenir des secrets).
const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  /** Via PgBouncer (mode transaction) pour l'api et le worker. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (result.success) return result.data;
  const lines = result.error.issues.map((issue) => {
    const variable = issue.path.join('.');
    return issue.code === 'invalid_type' && env[variable] === undefined
      ? `- ${variable} : manquante`
      : `- ${variable} : invalide (${issue.message})`;
  });
  throw new ConfigError(`Configuration invalide :\n${lines.join('\n')}`);
}

/** Jeton d'injection de la configuration validée. */
export const CONFIG = Symbol('CONFIG');
