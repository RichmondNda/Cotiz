import type { z } from 'zod';
import { DomainProblem } from './domain-problem.js';

/**
 * Valide une entrée HTTP avec le schéma de @cotiz/contracts ; échec → 422 `validation_failed`, avec par champ le code
 * de la règle en cause (jamais la valeur reçue).
 */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join('.') || '_';
    fields[path] ??= issue.code;
  }
  throw new DomainProblem('validation_failed', { fields });
}
