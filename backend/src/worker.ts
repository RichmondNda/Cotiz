import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';

// Processus sans HTTP. Il reste actif tant que des connexions (Redis, BullMQ) sont ouvertes ;
// en attendant le lot 0.5, un minuteur le garde en vie jusqu'à SIGINT / SIGTERM.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  const keepAlive = setInterval(() => undefined, 60_000);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      clearInterval(keepAlive);
    });
  }
  Logger.log('worker prêt', 'Bootstrap');
}

await bootstrap();
