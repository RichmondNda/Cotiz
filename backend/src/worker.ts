import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from './config.js';
import { WorkerModule } from './worker.module.js';

// Processus sans HTTP : les connexions Redis du relais outbox et des files BullMQ le gardent actif jusqu'à SIGINT /
// SIGTERM, qui ferment proprement files, relais et pool (enableShutdownHooks).
async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.createApplicationContext(WorkerModule.register(config));
  app.enableShutdownHooks();
  Logger.log('worker prêt', 'Bootstrap');
}

await bootstrap();
