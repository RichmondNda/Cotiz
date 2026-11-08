import 'reflect-metadata';
import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Config } from './config.js';
import { type Logger, PinoNestLogger } from './shared/logging/index.js';

/** Construit l'api HTTP (préfixe `/api/v1`) sans l'écouter : partagé par `main.ts` et les tests. */
export async function createApp(
  config: Config,
  options: NestApplicationOptions = {},
  modules: { logger?: Logger } = {},
): Promise<INestApplication> {
  // Journaux du démarrage gardés jusqu'à ce que le logger pino soit en place (configureApp).
  const app = await NestFactory.create(AppModule.register(config, modules), { bufferLogs: true, ...options });
  configureApp(app, config);
  app.enableShutdownHooks();
  return app;
}

/**
 * Réglages HTTP de l'application (aussi appliqués par les tests qui composent leur propre module racine) :
 * journaux par pino (shared/logging) ; préfixe `/api/v1` ; proxys de confiance pour l'IP du client (limitation de débit, audit). Sans TRUST_PROXY_HOPS,
 * X-Forwarded-For est ignoré : un client ne choisit jamais son IP.
 */
export function configureApp(app: INestApplication, config: Config): void {
  app.useLogger(app.get(PinoNestLogger));
  app.setGlobalPrefix('api/v1');
  const express = app.getHttpAdapter().getInstance() as {
    set(name: string, value: unknown): void;
    disable(name: string): void;
  };
  if (config.TRUST_PROXY_HOPS > 0) express.set('trust proxy', config.TRUST_PROXY_HOPS);
  // En-têtes de sécurité (architecture/02, lot 3.5) : réponses JSON, jamais exécutées ni encadrées ; la page de
  // documentation (développement) pose sa propre politique de contenu, plus loin.
  express.disable('x-powered-by');
  app.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    for (const [name, value] of API_SECURITY_HEADERS) res.setHeader(name, value);
    next();
  });
}

const API_SECURITY_HEADERS: readonly (readonly [string, string])[] = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'no-referrer'],
  ['Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'"],
];
