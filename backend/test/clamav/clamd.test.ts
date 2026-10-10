import { describe, expect, it } from 'vitest';
import { ClamdScanner } from '../../src/modules/files/infra/clamd-scanner.js';
import { EICAR } from '../support/fake-clamd.js';

/**
 * Contre un VRAI clamd (job CI « Antivirus », ou localement : `CLAMAV_URL=tcp://127.0.0.1:3310 pnpm --filter backend
 * test:clamav` avec infra/compose/local.yml). Hors de `pnpm verify` : le téléchargement des signatures prend des
 * minutes. Sans CLAMAV_URL, le test échoue : il ne doit jamais passer à vide.
 */
const url = process.env.CLAMAV_URL;

describe('clamd réel', () => {
  const scanner = () => {
    if (!url) throw new Error('CLAMAV_URL manquante : ce test exige un vrai clamd');
    const parsed = new URL(url);
    return new ClamdScanner(parsed.hostname, Number(parsed.port || 3310));
  };

  it('EICAR → infecté', async () => {
    const verdict = await scanner().scan(Buffer.from(EICAR));
    expect(verdict.infected).toBe(true);
    if (verdict.infected) expect(verdict.signature).toMatch(/eicar/i);
  });

  it('PDF sain → sain', async () => {
    expect(await scanner().scan(Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n'))).toEqual({ infected: false });
  });

  it('contenu de plusieurs blocs → sain', async () => {
    expect(await scanner().scan(Buffer.alloc(300_000, 0x41))).toEqual({ infected: false });
  });
});
