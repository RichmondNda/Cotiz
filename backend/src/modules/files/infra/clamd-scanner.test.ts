import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ClamdScanner } from './clamd-scanner.js';

/** Faux clamd : enregistre la commande et le flux reçus, répond `reply` (ou rien). */
function fakeClamd(reply: string | null): Promise<{ server: Server; port: number; received: () => Buffer }> {
  let data = Buffer.alloc(0);
  const server = createServer((socket: Socket) => {
    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      // Fin du flux INSTREAM : un bloc de longueur nulle.
      if (reply !== null && data.length >= 4 && data.subarray(-4).readUInt32BE(0) === 0) socket.end(`${reply}\0`);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0, received: () => data });
    });
  });
}

describe('ClamdScanner (protocole INSTREAM, clamd en TCP)', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it('envoie zINSTREAM puis des blocs préfixés de leur longueur, terminés par un bloc vide', async () => {
    const fake = await fakeClamd('stream: OK');
    server = fake.server;
    const content = Buffer.alloc(150_000, 7);
    expect(await new ClamdScanner('127.0.0.1', fake.port, { chunkBytes: 65_536 }).scan(content)).toEqual({
      infected: false,
    });
    const sent = fake.received();
    expect(sent.subarray(0, 10).toString()).toBe('zINSTREAM\0');
    let offset = 10;
    const sizes: number[] = [];
    for (;;) {
      const size = sent.readUInt32BE(offset);
      sizes.push(size);
      offset += 4 + size;
      if (size === 0) break;
    }
    expect(sizes).toEqual([65_536, 65_536, 18_928, 0]);
    expect(offset).toBe(sent.length);
  });

  it('signature trouvée → infecté, avec son nom', async () => {
    const fake = await fakeClamd('stream: Win.Test.EICAR_HDB-1 FOUND');
    server = fake.server;
    expect(await new ClamdScanner('127.0.0.1', fake.port).scan(Buffer.from('x'))).toEqual({
      infected: true,
      signature: 'Win.Test.EICAR_HDB-1',
    });
  });

  it('erreur de clamd → exception (le job sera repris), jamais « sain »', async () => {
    const fake = await fakeClamd('INSTREAM size limit exceeded. ERROR');
    server = fake.server;
    await expect(new ClamdScanner('127.0.0.1', fake.port).scan(Buffer.from('x'))).rejects.toThrow(/clamd/);
  });

  it('clamd injoignable → exception', async () => {
    const fake = await fakeClamd('stream: OK');
    const { port } = fake;
    fake.server.close();
    await expect(new ClamdScanner('127.0.0.1', port).scan(Buffer.from('x'))).rejects.toThrow();
  });

  it('clamd muet → exception après le délai', async () => {
    const fake = await fakeClamd(null);
    server = fake.server;
    await expect(new ClamdScanner('127.0.0.1', fake.port, { timeoutMs: 200 }).scan(Buffer.from('x'))).rejects.toThrow(
      /délai/,
    );
  });
});
