import { describe, expect, it } from 'vitest';
import { fontAssets } from './fonts.js';
import { invoiceDocument, type InvoiceDocumentInput } from './invoice.js';

const input: InvoiceDocumentInput = {
  number: 'CTZ-2026-000042',
  issuedOn: '2026-11-01',
  dueOn: '2026-11-16',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  association: { name: 'Tontine <Les Amis> & Cie', city: 'Abidjan', country: 'Côte d’Ivoire', email: null },
  plan: { name: 'Essentiel', billingPeriod: 'monthly' },
  amountText: '10\u202f000\u00a0F',
};

describe('invoiceDocument', () => {
  it('numéro, dates lisibles, période et montant', () => {
    const { html } = invoiceDocument(input);
    for (const value of [
      'CTZ-2026-000042',
      'Émise le 1er novembre 2026',
      'À régler au plus tard le 16 novembre 2026',
      'Du 1er novembre 2026 au 30 novembre 2026',
      'Abonnement Essentiel (mensuel)',
      '10\u202f000\u00a0F',
      'Abidjan, Côte d’Ivoire',
    ]) {
      expect(html).toContain(value);
    }
  });

  it('noms échappés, aucune ligne vide pour un champ absent', () => {
    const { html } = invoiceDocument(input);
    expect(html).toContain('Tontine &lt;Les Amis&gt; &amp; Cie');
    expect(html).not.toContain('<Les Amis>');
    expect(html).not.toContain('<div></div>');
  });

  it('annuel et polices jointes, aucune ressource externe', () => {
    const doc = invoiceDocument({ ...input, plan: { name: 'Pro', billingPeriod: 'yearly' } });
    expect(doc.html).toContain('Abonnement Pro (annuel)');
    expect(doc.html).not.toMatch(/https?:\/\//);
    expect(doc.assets).toEqual(fontAssets());
  });

  it('jamais « payer » dans le document (vocabulaire de l’interface)', () => {
    expect(invoiceDocument(input).html).not.toMatch(/\bpayer\b/i);
  });
});
