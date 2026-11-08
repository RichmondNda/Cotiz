import { createServer, type Server } from 'node:http';

export interface GotenbergRequest {
  path: string;
  /** `index.html` reçu. */
  html: string;
  /** Noms de tous les fichiers joints (index.html compris). */
  files: string[];
  /** Champs de formulaire (options de rendu). */
  fields: Record<string, string>;
}

export interface FakeGotenberg {
  url: string;
  requests: GotenbergRequest[];
  /** Les prochaines conversions répondent 503 (moteur indisponible). */
  failNext(count: number): void;
  close(): Promise<void>;
}

/**
 * Faux Gotenberg (route `/forms/chromium/convert/html`) pour les tests ordinaires : renvoie un « PDF » qui porte un
 * numéro de conversion, si bien qu'un PDF régénéré n'est jamais identique au premier. Le vrai Gotenberg : test/gotenberg.
 */
export async function startFakeGotenberg(): Promise<FakeGotenberg> {
  const requests: GotenbergRequest[] = [];
  let failures = 0;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      void (async () => {
        if (failures > 0) {
          failures -= 1;
          res.writeHead(503).end('indisponible');
          return;
        }
        const request = new Request('http://gotenberg.test', {
          method: 'POST',
          headers: { 'content-type': req.headers['content-type'] ?? '' },
          body: Buffer.concat(chunks),
        });
        // Faux serveur de test : corps reçu en entier, en mémoire ; l'analyse multipart de Request suffit ici.
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const form = await request.formData();
        const files: string[] = [];
        const fields: Record<string, string> = {};
        let html = '';
        for (const [name, value] of form.entries()) {
          if (typeof value === 'string') {
            fields[name] = value;
            continue;
          }
          files.push(value.name);
          if (value.name === 'index.html') html = await value.text();
        }
        requests.push({ path: req.url ?? '', html, files, fields });
        res
          .writeHead(200, { 'content-type': 'application/pdf' })
          .end(Buffer.from(`%PDF-1.7\n% conversion ${String(requests.length)}\n%%EOF\n`));
      })();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('faux Gotenberg : adresse inconnue');
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    requests,
    failNext: (count) => {
      failures = count;
    },
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
