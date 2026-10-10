/** Exécute `fn` dans une nouvelle transaction courte, du même contexte que la requête. */
export type InContext = <R>(fn: () => Promise<R>) => Promise<R>;

/**
 * Suite d'une requête à exécuter APRÈS le COMMIT de sa transaction : attendre un effet que seule la validation rend
 * visible (le worker ne voit l'outbox qu'après le COMMIT). Chaque accès aux données passe par `inContext`, une
 * nouvelle transaction du même contexte ; hors d'elle, `currentTx()` lève une erreur.
 */
export class AfterCommit<T> {
  // Pas « then » : l'objet deviendrait une promesse (thenable), résolue par le premier await.
  constructor(readonly run: (inContext: InContext) => Promise<T>) {}
}

/** Renvoyé par un cas d'usage : TenantContextInterceptor valide d'abord, puis exécute `run`. */
export function afterCommit<T>(run: (inContext: InContext) => Promise<T>): AfterCommit<T> {
  return new AfterCommit(run);
}
