import { describe, expect, it } from 'vitest';
import { fontAssets } from './fonts.js';
import { projectReportDocument, type ProjectReportDocumentInput } from './project-report.js';

const input: ProjectReportDocumentInput = {
  association: { name: 'Tontine <Les Amis> & Cie' },
  project: { name: 'Tontine 2026' },
  generatedOn: '2026-11-15',
  period: { from: null, to: null },
  totals: {
    expectedText: '250\u202f000\u00a0F',
    receivedText: '100\u202f000\u00a0F',
    remainingText: '175\u202f000\u00a0F',
    recoveryRate: 0.3,
  },
  rows: [
    {
      name: 'Kofi Annan',
      expectedText: '225\u202f000\u00a0F',
      paidText: '50\u202f000\u00a0F',
      remainingText: '175\u202f000\u00a0F',
      lateCount: 5,
      lastPaymentOn: '2026-04-06',
    },
    {
      name: '<script>x</script>',
      expectedText: '0\u00a0F',
      paidText: '0\u00a0F',
      remainingText: '0\u00a0F',
      lateCount: 0,
      lastPaymentOn: null,
    },
  ],
};

describe('projectReportDocument', () => {
  it('association, projet, date, totaux, taux et une ligne par souscripteur', () => {
    const { html } = projectReportDocument(input);
    for (const value of [
      'Tontine 2026',
      'Établi le 15 novembre 2026',
      'Toutes les échéances',
      '250\u202f000\u00a0F',
      '100\u202f000\u00a0F',
      '175\u202f000\u00a0F',
      '30\u00a0%',
      'Kofi Annan',
      '06/04/2026',
    ]) {
      expect(html).toContain(value);
    }
    expect(html.match(/<tr class="row">/g)).toHaveLength(2);
  });

  it('période bornée lisible ; taux absent : tiret', () => {
    const { html } = projectReportDocument({
      ...input,
      period: { from: '2026-01-01', to: '2026-06-30' },
      totals: { ...input.totals, recoveryRate: null },
    });
    expect(html).toContain('Échéances du 1er janvier 2026 au 30 juin 2026');
    expect(html).toMatch(/Taux de recouvrement<\/div>\s*<div class="value">—<\/div>/);
  });

  it('textes échappés, polices jointes, aucune ressource externe', () => {
    const doc = projectReportDocument(input);
    expect(doc.html).toContain('Tontine &lt;Les Amis&gt; &amp; Cie');
    expect(doc.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(doc.html).not.toContain('<script>');
    expect(doc.html).not.toMatch(/https?:\/\//);
    expect(doc.assets).toEqual(fontAssets());
  });

  it('vocabulaire de l’interface : ni « payer » ni « client »', () => {
    expect(projectReportDocument(input).html).not.toMatch(/\b(payer|client|adhérent)\b/i);
  });
});
