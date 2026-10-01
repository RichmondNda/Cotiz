import 'reflect-metadata';
import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Config } from './config.js';

/** Construit l'api HTTP (préfixe `/api/v1`) sans l'écouter : partagé par `main.ts` et les tests. */
export async function createApp(config: Config, options: NestApplicationOptions = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.register(config), options);
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  return app;
}
