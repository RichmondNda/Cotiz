import { AsyncLocalStorage } from 'node:async_hooks';

/** Informations de la requête HTTP en cours, pour l'audit et les journaux. */
export interface RequestInfo {
  /** `X-Request-Id` accepté ou généré (architecture/06). */
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  /** Rôle de l'acteur (owner, manager, viewer, subscriber, platform_*) : posé par les gardes (lots 1.1, 1.2). */
  actorRole?: string;
}

const storage = new AsyncLocalStorage<RequestInfo>();

/** Exécute `fn` avec ces informations de requête (middleware HTTP ; tests). */
export function runWithRequestInfo<T>(info: RequestInfo, fn: () => T): T {
  return storage.run({ ...info }, fn);
}

/** Informations de la requête en cours ; `undefined` hors requête HTTP (tâches du worker). */
export function currentRequestInfo(): Readonly<RequestInfo> | undefined {
  return storage.getStore();
}

/** Posé par la garde qui identifie l'acteur, une fois son rôle vérifié. */
export function setActorRole(role: string): void {
  const info = storage.getStore();
  if (!info) throw new Error('setActorRole() hors requête HTTP');
  info.actorRole = role;
}
