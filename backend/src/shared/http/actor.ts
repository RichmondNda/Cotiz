import { currentContext, type Space } from '../tenant-context/index.js';
import { DomainProblem } from './domain-problem.js';

/** Acteur identifié de la requête en cours. */
export interface Actor {
  space: Space;
  userId: string;
  associationId: string | undefined;
}

/**
 * Permission `authenticated` : l'acteur posé par la garde d'authentification (lot 1.1), sinon 401 `session_expired`.
 * À appeler dans la transaction de contexte (cas d'usage).
 */
export function requireActor(): Actor {
  const context = currentContext();
  if (!context?.userId) throw new DomainProblem('session_expired');
  return { space: context.space, userId: context.userId, associationId: context.associationId };
}
