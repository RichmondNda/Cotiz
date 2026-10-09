import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { runWithRequestInfo } from './request-info.js';

/** Identifiant de requête accepté du client : court, sans espace ni caractère de contrôle (journaux, en-têtes). */
const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;
const USER_AGENT_MAX = 512;

interface HttpResponse {
  setHeader(name: string, value: string): unknown;
}

interface HttpRequest {
  ip?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
}

const header = (req: HttpRequest, name: string): string | undefined => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Pose les informations de la requête dès son entrée : `X-Request-Id` repris s'il est valide, sinon généré, et
 * renvoyé ;
 * IP vue par Express (`trust proxy` à régler derrière le proxy de production) ; user-agent tronqué.
 */
@Injectable()
export class RequestInfoMiddleware implements NestMiddleware {
  use(req: HttpRequest, res: HttpResponse, next: () => void): void {
    const requested = header(req, 'x-request-id');
    const userAgent = header(req, 'user-agent');
    const requestId = requested !== undefined && REQUEST_ID.test(requested) ? requested : randomUUID();
    // Renvoyé dans la réponse (architecture/06), y compris en erreur : le front le cite au support.
    res.setHeader('X-Request-Id', requestId);
    runWithRequestInfo(
      {
        requestId,
        ip: req.ip ?? null,
        userAgent: userAgent ? userAgent.slice(0, USER_AGENT_MAX) : null,
      },
      next,
    );
  }
}
