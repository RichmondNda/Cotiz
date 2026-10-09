import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defer, lastValueFrom, type Observable } from 'rxjs';
import { getRequestContext, WITHOUT_TENANT_CONTEXT } from './request-context.js';
import { FOR_REQUEST, runInHttpScope, TenantDatabase } from './tenant-database.js';

/**
 * Une requête HTTP = une transaction de contexte : ouverte avant le contrôleur, validée à sa réponse,
 * annulée sur erreur. Sans contexte posé par une garde, la base voit l'espace `none` (zéro ligne tenant).
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly db: TenantDatabase,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const handle = () => lastValueFrom(next.handle(), { defaultValue: undefined });
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(WITHOUT_TENANT_CONTEXT, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Toute la requête est marquée HTTP : withTenantContext() (tâches, espace system) y est refusé.
    if (skip) return defer(() => runInHttpScope(handle));
    const tenant = getRequestContext(context.switchToHttp().getRequest<object>());
    // Transaction ouverte à l'abonnement ; le contrôleur s'exécute dans son contexte asynchrone.
    // Une réponse en flux serait lue après le COMMIT : lire les données avant de renvoyer le flux.
    return defer(() => runInHttpScope(() => this.db[FOR_REQUEST](tenant, handle)));
  }
}
