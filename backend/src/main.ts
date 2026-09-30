import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

// Port et préfixe fixes jusqu'à la configuration validée par Zod (lot 0.1, étape 5).
const PORT = 4000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  await app.listen(PORT);
  Logger.log(`api prête sur http://localhost:${String(PORT)}/api/v1`, 'Bootstrap');
}

await bootstrap();
