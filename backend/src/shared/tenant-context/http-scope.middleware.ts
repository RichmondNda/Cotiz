import { Injectable, type NestMiddleware } from '@nestjs/common';
import { runInHttpScope } from './tenant-database.js';

/**
 * Marque la requête HTTP dès son entrée, avant gardes, pipes et filtres : withTenantContext() (tâches) y est refusé.
 * Seul accès aux données d'une requête : la transaction de TenantContextInterceptor (architecture/02).
 */
@Injectable()
export class HttpScopeMiddleware implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: () => void): void {
    runInHttpScope(next);
  }
}
