import {
  Inject,
  Injectable,
  type MiddlewareConsumer,
  Module,
  type NestMiddleware,
  type NestModule,
} from '@nestjs/common';
import { Counter, Histogram, type Registry } from 'prom-client';
import { routeTemplate } from '../request-info/index.js';
import { HTTP_DURATION, HTTP_REQUESTS } from './metric-names.js';
import { METRICS_REGISTRY } from './metrics.module.js';

interface HttpRequest {
  method: string;
  baseUrl?: string;
  route?: { path?: unknown };
}

interface HttpResponse {
  statusCode: number;
  once(event: 'close', listener: () => void): unknown;
}

/** Bornes de durée (secondes) : p95 lisible autour du seuil d'alerte de 1 s (architecture/11). */
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * RED par route (architecture/11) : nombre de requêtes et durée, par méthode, route gabarit et statut. La route est
 * celle du contrat (`/api/v1/files/:id`) ou `unmatched` : jamais de valeur venue de l'URL dans une étiquette.
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  private readonly requests: Counter<'method' | 'route' | 'status'>;
  private readonly duration: Histogram<'method' | 'route' | 'status'>;

  constructor(@Inject(METRICS_REGISTRY) registry: Registry) {
    const labelNames = ['method', 'route', 'status'] as const;
    this.requests = new Counter({
      name: HTTP_REQUESTS,
      help: 'Requêtes HTTP traitées, par méthode, route gabarit et statut',
      labelNames,
      registers: [registry],
    });
    this.duration = new Histogram({
      name: HTTP_DURATION,
      help: 'Durée des requêtes HTTP (secondes), par méthode, route gabarit et statut',
      labelNames,
      buckets: BUCKETS,
      registers: [registry],
    });
  }

  use(req: HttpRequest, res: HttpResponse, next: () => void): void {
    const start = process.hrtime.bigint();
    res.once('close', () => {
      const labels = { method: req.method, route: routeTemplate(req), status: String(res.statusCode) };
      this.requests.inc(labels);
      this.duration.observe(labels, Number(process.hrtime.bigint() - start) / 1e9);
    });
    next();
  }
}

/** Mesure RED des requêtes de l'api. */
@Module({})
export class HttpMetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('{*path}');
  }
}
