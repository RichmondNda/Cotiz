import { contractDocument } from '@cotiz/pdf-templates';
import { describe, expect, it } from 'vitest';
import { GotenbergRenderer } from '../../src/modules/documents/infra/gotenberg-renderer.js';

/**
 * Contre un VRAI Gotenberg (localement : `docker compose -f infra/compose/local.yml --profile pdf up -d`, puis
 * `GOTENBERG_URL=http://127.0.0.1:3100 pnpm --filter backend test:gotenberg`). Hors de `pnpm verify` : Chromium est
 * lourd. Sans GOTENBERG_URL, le test échoue : il ne doit jamais passer à vide.
 */
const url = process.env.GOTENBERG_URL;

const document = contractDocument({
  association: { name: 'Tontine des Amis' },
  project: { name: 'Cotisation 2026' },
  body: 'Je soussigné(e) Moussa Traoré m’engage à verser 25\u202f000 F.\n\nArticle 2 : modalités.',
  associationSigner: { name: 'Awa Koné', title: 'Présidente', signedAt: '2026-11-01T09:00:00.000Z' },
  subscriber: { name: 'Moussa Traoré', phone: '+2250544218790' },
  signature: {
    id: '0193a000-0000-7000-8000-000000000001',
    enrollmentId: '0193a000-0000-7000-8000-000000000002',
    signedAt: '2026-11-08T14:30:05.000Z',
    ip: '203.0.113.7',
    userAgent: 'Mozilla/5.0',
    consentText: 'J’ai lu le contrat et je l’accepte.',
    renderedSha256: 'a'.repeat(64),
    templateSha256: 'b'.repeat(64),
  },
  timezone: 'Africa/Abidjan',
});

describe('Gotenberg réel', () => {
  const renderer = () => {
    if (!url) throw new Error('GOTENBERG_URL manquante : ce test exige un vrai Gotenberg');
    return new GotenbergRenderer(url);
  };

  it('contrat + page de preuve : un PDF A4 de deux pages au moins, polices embarquées', async () => {
    const pdf = await renderer().render(document);
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect((text.match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // A4 : 595 × 842 points (Chromium : 594,96 × 841,92).
    expect(text).toMatch(/\/MediaBox\s*\[0 0 59[45](\.\d+)? 84[12](\.\d+)?\]/);
    expect(text).toMatch(/\/BaseFont\s*\/\w+\+Poppins-/);
    expect(text).toMatch(/\/BaseFont\s*\/\w+\+Inter-/);
  });
});
