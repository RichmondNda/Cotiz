import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { runWithLogContext } from './log-context.js';
import { type Logger, ROOT_LOGGER } from './logger.js';

interface HttpRequest {
  method: string;
  baseUrl?: string;
  route?: { path?: unknown };
}

interface HttpResponse {
  statusCode: number;
  writableFinished: boolean;
  once(event: 'close', listener: () => void): unknown;
}

/**
 * Une ligne par requête (architecture/11) : méthode, route gabarit (`/api/v1/files/:id`, jamais l'URL ni la query
 * string, qui peuvent citer un code ou un téléphone), statut, durée. Jamais le corps. La ligne est écrite dans le
 * contexte de la requête (AsyncLocalStorage.bind) : requestId, association, utilisateur pseudonymisé, trace. Ouvre le
 * contexte de journal de la requête.
 */
@Injectable()
export class AccessLogMiddleware implements NestMiddleware {
  constructor(@Inject(ROOT_LOGGER) private readonly logger: Logger) {}

  use(req: HttpRequest, res: HttpResponse, next: () => void): void {
    // Contexte de journal propre à la requête, ouvert avant de lier la ligne d'accès : les gardes y posent association
    // et utilisateur (setLogIdentity), que la ligne d'accès porte aussi.
    runWithLogContext({}, () => {
      this.logOnClose(req, res);
      next();
    });
  }

  private logOnClose(req: HttpRequest, res: HttpResponse): void {
    const start = process.hrtime.bigint();
    res.once(
      'close',
      AsyncLocalStorage.bind(() => {
        const durationMs = Number((process.hrtime.bigint() - start) / 1000n) / 1000;
        // Sans route du contrat (404), Express garde le joker des middlewares (`*path`) : `unmatched`.
        const path = typeof req.route?.path === 'string' ? `${req.baseUrl ?? ''}${req.route.path}` : '*';
        const route = path.includes('*') ? 'unmatched' : path;
        const status = res.statusCode;
        const fields = {
          method: req.method,
          route,
          status,
          durationMs,
          ...(res.writableFinished ? {} : { aborted: true }),
        };
        if (status >= 500) this.logger.error(fields, 'requête traitée');
        else this.logger.info(fields, 'requête traitée');
      }),
    );
  }
}
