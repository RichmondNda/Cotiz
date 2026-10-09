// Erreurs du catalogue (docs/specs/errors.yaml) → codes attendus par certains écrans de la V0 (`codeErreur()`).
import { ApiError } from '@cotiz/api-client'

/**
 * Relance l'erreur avec le code de l'interface : `table[code]`, ou `table['champ:<champ>']` pour un `validation_failed`
 * dont `fields.<champ>` est renseigné. Code inconnu de la table : le code du catalogue est conservé.
 */
export function traduireErreur(e: unknown, table: Record<string, string>): never {
  if (!(e instanceof ApiError)) throw e
  const champ = Object.keys(e.problem?.fields ?? {}).map(f => table[`champ:${f}`]).find(Boolean)
  const code = champ ?? table[e.code ?? ''] ?? e.code
  throw Object.assign(new Error(code ?? e.message), { data: { code }, statusCode: e.status, problem: e.problem })
}
