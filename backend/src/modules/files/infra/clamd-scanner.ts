import { connect } from 'node:net';
import type { ScanVerdict, VirusScanner } from '../domain/virus-scanner.js';

/**
 * Client clamd en TCP (architecture/08), protocole INSTREAM : `zINSTREAM\0`, puis le contenu en blocs préfixés de
 * leur longueur (32 bits, gros-boutiste), terminé par un bloc vide ; réponse `stream: OK` ou `stream: <nom> FOUND`.
 * Toute autre réponse, une coupure ou un délai dépassé lève une erreur : jamais de verdict « sain » par défaut.
 */
export class ClamdScanner implements VirusScanner {
  private readonly chunkBytes: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly host: string,
    private readonly port: number,
    options: { chunkBytes?: number; timeoutMs?: number } = {},
  ) {
    this.chunkBytes = options.chunkBytes ?? 64 * 1024;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  scan(content: Buffer): Promise<ScanVerdict> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      let reply = '';
      const fail = (error: Error) => {
        socket.destroy();
        reject(error);
      };
      socket.setTimeout(this.timeoutMs, () => {
        fail(new Error('clamd : délai dépassé'));
      });
      socket.on('error', (error) => {
        fail(new Error(`clamd : ${error.message}`));
      });
      socket.on('data', (data: Buffer) => {
        reply += data.toString('utf8');
      });
      socket.on('end', () => {
        const verdict = reply.replace(/\0$/, '').trim();
        socket.destroy();
        const found = /^stream: (.+) FOUND$/.exec(verdict);
        if (verdict === 'stream: OK') resolve({ infected: false });
        else if (found?.[1]) resolve({ infected: true, signature: found[1] });
        else reject(new Error(`clamd : réponse inattendue (${verdict.slice(0, 100)})`));
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < content.length; offset += this.chunkBytes) {
          const chunk = content.subarray(offset, offset + this.chunkBytes);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length, 0);
          socket.write(size);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}
