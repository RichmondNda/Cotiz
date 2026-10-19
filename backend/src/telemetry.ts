// Préchargé avant main.ts et worker.ts (`node --import ./dist/telemetry.js dist/main.js`) : le traçage OpenTelemetry
// doit être en place avant le chargement de http, Express, pg et ioredis pour les instrumenter. Le hook ESM
// (import-in-the-middle) instrumente aussi les modules chargés par `import`.
import { register } from 'node:module';
import { loadConfig } from './config.js';
import { startTracing } from './shared/telemetry/tracing.js';

// Hook limité aux bibliothèques instrumentées (tracing.ts) : envelopper tous les modules expose une concurrence
// d'import-in-the-middle (`export *` résolu contre un autre module, ERR_MODULE_NOT_FOUND au démarrage).
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url, {
  data: { include: ['http', 'https', 'express', 'pg', 'ioredis'] },
});

const service = /worker\.[jt]s$/.test(process.argv[1] ?? '') ? 'worker' : 'api';
let config;
try {
  config = loadConfig();
} catch {
  // Configuration invalide : main.ts ou worker.ts l'affiche et s'arrête.
}
if (config) {
  const tracing = startTracing(config, { service });
  // Spans en attente exportés avant la sortie (exportateur OTLP par lots).
  process.once('beforeExit', () => {
    void tracing.shutdown();
  });
}
