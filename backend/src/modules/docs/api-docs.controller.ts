import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Controller, Get, Header } from '@nestjs/common';

// Documentation interne de l'API (Scalar), en développement uniquement (lot 0.2, étape 5).
// Tout est servi localement : script Scalar depuis node_modules, contrat depuis @cotiz/contracts. La CSP interdit
// tout appel hors du même site (règle « aucun fournisseur externe ») ; polices, télémétrie et proxy Scalar sont coupés.

const require = createRequire(import.meta.url);
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Scalar injecte ses styles à l'exécution.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
].join('; ');

const PAGE = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cotiz API</title>
  </head>
  <body>
    <div id="cotiz-api-docs"></div>
    <script src="/api/v1/docs/scalar.js"></script>
    <script src="/api/v1/docs/init.js"></script>
  </body>
</html>
`;

// Conteneur `#cotiz-api-docs` : le script autonome monte de lui-même un `#api-reference` vide.
const INIT = `fetch('/api/v1/docs/openapi.json')
  .then((response) => response.json())
  .then((content) => {
    window.Scalar.createApiReference('#cotiz-api-docs', {
      content,
      withDefaultFonts: false,
      // Polices système : les @font-face du bundle (fonts.scalar.com) sont retirés au service du script.
      customCss: ':root, .light-mode, .dark-mode { --scalar-font: system-ui, sans-serif; --scalar-font-code: ui-monospace, monospace; }',
      telemetry: false,
      persistAuth: false,
      agent: { disabled: true },
      mcp: { disabled: true },
    });
  });
`;

/** Bundle autonome de @scalar/api-reference (dépendance de développement, absente de l'image de production). */
function scalarBundlePath(): string {
  return path.join(path.dirname(require.resolve('@scalar/api-reference')), 'browser', 'standalone.js');
}

@Controller('docs')
export class ApiDocsController {
  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('content-security-policy', CSP)
  page(): string {
    return PAGE;
  }

  @Get('init.js')
  @Header('content-type', 'text/javascript; charset=utf-8')
  init(): string {
    return INIT;
  }

  @Get('scalar.js')
  @Header('content-type', 'text/javascript; charset=utf-8')
  @Header('cache-control', 'public, max-age=3600')
  async scalar(): Promise<string> {
    // Le bundle déclare ses polices sur fonts.scalar.com même avec `withDefaultFonts: false` : on retire ces @font-face.
    return (await readFile(scalarBundlePath(), 'utf8')).replace(/@font-face\s*\{[^}]*fonts\.scalar\.com[^}]*\}/g, '');
  }

  @Get('openapi.json')
  @Header('content-type', 'application/json; charset=utf-8')
  async openapi(): Promise<string> {
    return readFile(require.resolve('@cotiz/contracts/openapi.json'), 'utf8');
  }
}
