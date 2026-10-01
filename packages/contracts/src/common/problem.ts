import { z } from 'zod';
import { ERROR_CODES } from '../generated/error-codes.js';

export const ErrorCodeSchema = z.enum(ERROR_CODES);

/**
 * Erreur `application/problem+json` (RFC 9457) avec un `code` stable du catalogue docs/specs/errors.yaml.
 * Les membres d'extension (ex. `maxAmount` pour `amount_exceeds_remaining`) sont conservés.
 */
export const Problem = z.looseObject({
  type: z.string(),
  title: z.string(),
  status: z.int().min(400).max(599),
  code: ErrorCodeSchema,
  detail: z.string().optional(),
  /** Erreur par champ (`validation_failed`) : chemin du champ → code de la règle. */
  fields: z.record(z.string(), z.string()).optional(),
  requestId: z.string().optional(),
});
export type Problem = z.infer<typeof Problem>;
