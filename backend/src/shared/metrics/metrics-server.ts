import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import type { Registry } from 'prom-client';

/**
 * Serveur HTTP interne des métriques (architecture/11) : `GET /metrics` au format Prometheus, rien d'autre. Séparé de
 * l'api publique (jamais sous /api/v1, jamais derrière le proxy), sur METRICS_HOST (127.0.0.1 par défaut). Port 0 :
 * désactivé. Un port indisponible n'arrête pas le processus : les métriques ne sont jamais vitales.
 */
export class MetricsServer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MetricsServer.name);
  private server: Server | undefined;

  constructor(
    private readonly registry: Registry,
    private readonly options: { host: string; port: number },
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async start(): Promise<void> {
    if (this.options.port === 0) return;
    const server = createServer((req, res) => {
      if (req.url !== '/metrics') {
        res.writeHead(404).end();
        return;
      }
      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET' }).end();
        return;
      }
      this.registry.metrics().then(
        (body) => {
          res.writeHead(200, { 'Content-Type': this.registry.contentType }).end(body);
        },
        (error: unknown) => {
          this.logger.error({ msg: 'métriques indisponibles', err: error });
          res.writeHead(500).end();
        },
      );
    });
    await new Promise<void>((resolve) => {
      server.once('error', (error) => {
        this.logger.warn({ msg: 'serveur de métriques non démarré', port: this.options.port, err: error });
        resolve();
      });
      server.listen(this.options.port, this.options.host, () => {
        // Après le démarrage, une erreur du serveur (EMFILE…) est journalisée, jamais fatale.
        server.on('error', (error) => {
          this.logger.warn({ msg: 'serveur de métriques en erreur', err: error });
        });
        this.server = server;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    await new Promise((resolve) => server.close(resolve));
  }

  /** Adresse d'écoute ; `null` si désactivé ou non démarré. */
  address(): AddressInfo | null {
    return (this.server?.address() as AddressInfo | null | undefined) ?? null;
  }
}
