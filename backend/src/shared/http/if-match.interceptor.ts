import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import { currentRequestInfo, setExpectedVersion } from '../request-info/index.js';
import { DomainProblem } from './domain-problem.js';
import { endpointOf } from './endpoint.js';

/** `W/"3"` (client typé), `"3"` ou `3` : une seule version, entière. */
const IF_MATCH = /^(?:W\/)?"?(\d{1,9})"?$/;

/** Version attendue par `If-Match`, pour `updateWithVersion()` ; réservé aux endpoints qui portent le drapeau. */
export function expectedVersion(): number {
  const version = currentRequestInfo()?.expectedVersion;
  if (version === undefined)
    throw new Error('expectedVersion() : If-Match absent (endpoint sans le drapeau ifMatch ?)');
  return version;
}

/**
 * Verrou optimiste (architecture/06) : pour les endpoints du contrat qui portent `ifMatch`, `If-Match` est exigé
 * (sinon 422 validation_failed) et sa version transmise au cas d'usage (`expectedVersion()`) ; une version périmée
 * donne 412 version_conflict (VersionConflictError → ProblemFilter). Toute réponse qui porte une `version` entière
 * reçoit `ETag: W/"<version>"`.
 */
@Injectable()
export class IfMatchInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    if (endpointOf(this.reflector, context)?.def.flags.ifMatch) {
      const raw = http.getRequest<{ headers: Record<string, string | string[] | undefined> }>().headers['if-match'];
      const header = Array.isArray(raw) ? raw.join(',') : raw;
      if (header === undefined || header === '') {
        throw new DomainProblem('validation_failed', { fields: { 'If-Match': 'required' } });
      }
      const match = IF_MATCH.exec(header.trim());
      if (!match?.[1]) throw new DomainProblem('validation_failed', { fields: { 'If-Match': 'invalid' } });
      setExpectedVersion(Number(match[1]));
    }
    const response = http.getResponse<{ setHeader(name: string, value: string): void }>();
    return next.handle().pipe(
      map((body: unknown) => {
        const version =
          body !== null && typeof body === 'object' && !Array.isArray(body)
            ? (body as { version?: unknown }).version
            : undefined;
        if (typeof version === 'number' && Number.isInteger(version))
          response.setHeader('ETag', `W/"${String(version)}"`);
        return body;
      }),
    );
  }
}
