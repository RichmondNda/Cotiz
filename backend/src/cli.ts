import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { CliModule } from './cli/cli.module.js';
import { runCli } from './cli/commands.js';
import { loadConfig } from './config.js';
import { PinoNestLogger } from './shared/logging/index.js';

// Scripts d'exploitation (architecture/14) : `pnpm --filter backend cli <commande> …`, en production
// `node dist/cli.js <commande> …`. Même configuration que l'api (DATABASE_URL en cotiz_app).
async function main(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.createApplicationContext(CliModule.register(config), { bufferLogs: true });
  app.useLogger(app.get(PinoNestLogger));
  try {
    process.exitCode = await runCli(app, process.argv.slice(2), { out: process.stdout, err: process.stderr });
  } finally {
    await app.close();
  }
}

await main();
