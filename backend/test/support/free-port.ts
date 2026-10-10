import { createServer } from 'node:net';

/** Port TCP libre sur 127.0.0.1 (serveurs internes démarrés par les tests sur un port fixé par la configuration). */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => {
        resolve(port);
      });
    });
  });
}
