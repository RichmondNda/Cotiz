import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { setActorRole } from '../../src/shared/request-info/index.js';
import { SPACES, type Space, setRequestContext } from '../../src/shared/tenant-context/index.js';

/**
 * Garde d'authentification de TEST : remplace la chaîne des vraies gardes (`AppModule.register(config, { guards:
 * [TestAuthGuard] })`) pour éprouver des espaces qu'elles n'ouvrent pas encore (association : lot 1.2). Jamais
 * importée par src/. Lit le contexte dans des en-têtes :
 * x-test-space, x-test-user, x-test-association, x-test-role. Sans x-test-space : requête anonyme.
 */
@Injectable()
export class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const space = req.headers['x-test-space'];
    if (!space) return true;
    if (!(SPACES as readonly string[]).includes(space)) throw new Error(`x-test-space inconnu : ${space}`);
    setRequestContext(req, {
      space: space as Space,
      userId: req.headers['x-test-user'],
      associationId: req.headers['x-test-association'],
    });
    const role = req.headers['x-test-role'];
    if (role) setActorRole(role);
    return true;
  }
}

/** En-têtes de la garde de test pour un contexte donné. */
export function as(context: { space: Space; userId?: string; associationId?: string; role?: string }) {
  return {
    'x-test-space': context.space,
    ...(context.userId ? { 'x-test-user': context.userId } : {}),
    ...(context.associationId ? { 'x-test-association': context.associationId } : {}),
    ...(context.role ? { 'x-test-role': context.role } : {}),
  };
}
