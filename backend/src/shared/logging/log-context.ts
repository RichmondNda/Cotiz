import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexte de journal d'une requête HTTP (posé par AccessLogMiddleware) ou d'une tâche du worker. Pour les journaux
 * seulement : jamais lu comme une autorisation (le contexte vérifié est celui de shared/tenant-context).
 */
export interface LogContext {
  queue?: string;
  jobId?: string;
  task?: string;
  eventType?: string;
  associationId?: string | null;
  /** Jamais écrit tel quel : le logger n'en écrit que la référence pseudonyme (`userRef`). */
  userId?: string | null;
}

const storage = new AsyncLocalStorage<LogContext>();

/** Exécute `fn` avec ce contexte : chaque ligne journalisée pendant `fn` le porte. */
export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return storage.run({ ...storage.getStore(), ...context }, fn);
}

export function currentLogContext(): Readonly<LogContext> | undefined {
  return storage.getStore();
}

/**
 * Identité vérifiée par les gardes (setRequestContext) : les deux champs sont remplacés à chaque appel, jamais
 * hérités d'un contexte précédent. Sans effet hors d'un contexte de journal.
 */
export function setLogIdentity(identity: { userId?: string | undefined; associationId?: string | undefined }): void {
  const context = storage.getStore();
  if (!context) return;
  context.userId = identity.userId ?? null;
  context.associationId = identity.associationId ?? null;
}
