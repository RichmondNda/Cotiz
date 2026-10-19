import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getRequestContext, setRequestContext } from '../tenant-context/index.js';
import { endpointOf } from './endpoint.js';

/**
 * Espace des endpoints sans acteur (endpoints.yaml : `space: auth` ou `public`) : la transaction de la requête voit
 * cet espace, tiré du contrat et jamais de la requête. Ne remplace jamais un contexte posé par une autre garde.
 */
@Injectable()
export class ContractSpaceGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const space = endpointOf(this.reflector, context)?.def.space;
    const request = context.switchToHttp().getRequest<object>();
    if ((space === 'auth' || space === 'public') && !getRequestContext(request)) {
      setRequestContext(request, { space });
    }
    return true;
  }
}
