import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await createApp(config);
  await app.listen(config.API_PORT);
  Logger.log(`api prête sur http://localhost:${String(config.API_PORT)}/api/v1`, 'Bootstrap');
}

await bootstrap();
