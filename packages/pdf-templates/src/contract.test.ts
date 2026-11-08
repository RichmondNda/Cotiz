import { describe, expect, it } from 'vitest';
import { contractDocument, type ContractDocumentInput } from './contract.js';
import { fontAssets } from './fonts.js';

const input: ContractDocumentInput = {
  association: { name: 'Tontine <Les Amis> & Cie' },
  project: { name: 'Cotisation 2026' },
  body: 'Article 1.\nJe m’engage à verser 25\u202f000 F.\n\nArticle 2 : <script>alert(1)</script>',
  associationSigner: { name: 'Awa Koné', title: 'Présidente', signedAt: '2026-11-01T09:00:00.000Z' },
  subscriber: { name: 'Moussa Traoré', phone: '+2250544218790' },
  signature: {
    id: '0193a000-0000-7000-8000-000000000001',
    enrollmentId: '0193a000-0000-7000-8000-000000000002',
    signedAt: '2026-11-08T14:30:05.000Z',
    ip: '203.0.113.7',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130',
    consentText: 'J’ai lu le contrat et je l’accepte.',
    renderedSha256: 'a'.repeat(64),
    templateSha256: 'b'.repeat(64),
  },
  timezone: 'Africa/Abidjan',
};

describe('contractDocument', () => {
  it('texte du contrat échappé (aucune balise du modèle ni des noms), paragraphes et retours à la ligne', () => {
    const { html } = contractDocument(input);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Tontine &lt;Les Amis&gt; &amp; Cie');
    expect(html).toContain('<p>Article 1.<br>Je m’engage à verser 25\u202f000 F.</p>');
    expect(html).toContain('Cotisation 2026');
  });

  it('page de preuve : sur sa propre page, avec tous les éléments de la signature', () => {
    const { html } = contractDocument(input);
    const proof = html.slice(html.indexOf('class="proof"'));
    expect(html).toMatch(/<section class="proof"/);
    for (const value of [
      'Page de preuve',
      'Moussa Traoré',
      '+2250544218790',
      '2026-11-08T14:30:05.000Z',
      '8 novembre 2026',
      '203.0.113.7',
      'Mozilla/5.0 (Linux; Android 14) Chrome/130',
      'J’ai lu le contrat et je l’accepte.',
      'a'.repeat(64),
      'b'.repeat(64),
      input.signature.id,
      input.signature.enrollmentId,
      'Awa Koné',
    ]) {
      expect(proof).toContain(value);
    }
  });

  it('adresse IP ou navigateur absents : « non enregistré »', () => {
    const { html } = contractDocument({ ...input, signature: { ...input.signature, ip: null, userAgent: null } });
    const proof = html.slice(html.indexOf('class="proof"'));
    expect(proof.match(/non enregistré/g)).toHaveLength(2);
  });

  it('premier du mois écrit « 1er » (typographie française)', () => {
    const { html } = contractDocument(input);
    expect(html).toContain('Signé le 1er novembre 2026');
    expect(html).not.toMatch(/\b1 novembre/);
  });

  it('déterministe : même entrée, même document', () => {
    expect(contractDocument(input)).toEqual(contractDocument(input));
  });

  it('polices embarquées (Poppins, Inter) déclarées et fournies, aucune ressource externe', () => {
    const { html, assets } = contractDocument(input);
    expect(html).not.toMatch(/https?:\/\//);
    for (const asset of assets) expect(html).toContain(`url('${asset.name}')`);
    expect(assets.map((a) => a.name)).toEqual(fontAssets().map((a) => a.name));
  });
});

describe('fontAssets', () => {
  it('fichiers woff2 de @fontsource, non vides', () => {
    const fonts = fontAssets();
    expect(fonts.length).toBeGreaterThanOrEqual(4);
    for (const font of fonts) {
      expect(font.name).toMatch(/^(inter|poppins)-latin-\d00-normal\.woff2$/);
      expect(Buffer.from(font.content.subarray(0, 4)).toString('latin1')).toBe('wOF2');
    }
  });
});
