import { createServer, type Server } from 'node:net';

/**
 * Chaîne de test standard EICAR (inoffensive), reconnue par tous les antivirus. Assemblée à l'exécution : le fichier
 * source ne la contient pas telle quelle (un antivirus de poste le mettrait en quarantaine).
 */
export const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');

export interface FakeClamd {
  url: string;
  /** Contenus reçus, dans l'ordre. */
  scanned: Buffer[];
  /** Retarde la réponse des contenus qui contiennent ce marqueur (clamd lent). */
  delayWhenContains(marker: string, ms: number): void;
  close(): Promise<void>;
}

/**
 * Faux clamd (protocole INSTREAM) pour les tests ordinaires : « FOUND » si le contenu contient EICAR, « OK » sinon.
 * Le vrai clamd tourne dans le job CI dédié (test/clamav).
 */
export async function startFakeClamd(): Promise<FakeClamd> {
  const scanned: Buffer[] = [];
  const delays: { marker: string; ms: number }[] = [];
  const server: Server = createServer((socket) => {
    let data = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      data = Buffer.concat([data, chunk]);
      let offset = 10;
      const parts: Buffer[] = [];
      while (offset + 4 <= data.length) {
        const size = data.readUInt32BE(offset);
        if (size === 0) {
          const content = Buffer.concat(parts);
          scanned.push(content);
          const text = content.toString('latin1');
          const reply = text.includes(EICAR) ? 'stream: Win.Test.EICAR_HDB-1 FOUND\0' : 'stream: OK\0';
          const delay = delays.find((d) => text.includes(d.marker))?.ms ?? 0;
          setTimeout(() => {
            socket.end(reply);
          }, delay);
          return;
        }
        if (offset + 4 + size > data.length) return;
        parts.push(data.subarray(offset + 4, offset + 4 + size));
        offset += 4 + size;
      }
    });
    socket.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `tcp://127.0.0.1:${String(port)}`,
    scanned,
    delayWhenContains: (marker, ms) => {
      delays.push({ marker, ms });
    },
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
