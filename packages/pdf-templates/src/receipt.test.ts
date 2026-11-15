import { describe, expect, it } from 'vitest';
import { fontAssets } from './fonts.js';
import { receiptDocument, type ReceiptDocumentInput } from './receipt.js';

const input: ReceiptDocumentInput = {
  paymentId: '00000000-0000-7000-8000-00000000f001',
  issuedOn: '2026-11-14',
  paidOn: '2026-11-12',
  validatedOn: '2026-11-14',
  association: { name: 'Tontine <Les Amis> & Cie', city: 'Abidjan', country: 'Côte d’Ivoire' },
  subscriber: { name: 'Kofi Annan' },
  project: { name: 'Cotisation 2026' },
  methodLabel: 'Orange Money',
  transactionReference: 'OM-7781',
  amountText: '50\u202f000\u00a0F',
  lines: [
    { dueOn: '2026-03-05', amountText: '25\u202f000\u00a0F' },
    { dueOn: '2026-04-05', amountText: '25\u202f000\u00a0F' },
  ],
};

describe('receiptDocument', () => {
  it('émetteur, souscripteur, projet, dates, moyen, référence, échéances et total', () => {
    const { html } = receiptDocument(input);
    for (const value of [
      'Reçu de paiement',
      'Établi le 14 novembre 2026',
      'Réf. 00000000-0000-7000-8000-00000000f001',
      'Kofi Annan',
      'Cotisation 2026',
      '<dt>Date du paiement</dt><dd>12 novembre 2026</dd>',
      '<dt>Validé le</dt><dd>14 novembre 2026</dd>',
      '<dt>Moyen</dt><dd>Orange Money</dd>',
      '<dt>Référence de transaction</dt><dd>OM-7781</dd>',
      'Échéance du 5 mars 2026',
      '50\u202f000\u00a0F',
      'Abidjan, Côte d’Ivoire',
    ]) {
      expect(html).toContain(value);
    }
    expect(html.match(/<tr class="line">/g)).toHaveLength(2);
  });

  it('textes des personnes échappés ; moyen et référence absents : lignes omises', () => {
    const { html } = receiptDocument({ ...input, methodLabel: null, transactionReference: null });
    expect(html).toContain('Tontine &lt;Les Amis&gt; &amp; Cie');
    expect(html).not.toContain('<Les Amis>');
    expect(html).not.toContain('Moyen');
    expect(html).not.toContain('Référence de transaction');
  });

  it('vocabulaire : jamais « payer », « encaisser » ni « facture »', () => {
    const { html } = receiptDocument(input);
    expect(html).not.toMatch(/\bpay(er|é)\b|encaiss|factur/i);
  });

  it('polices jointes, aucune ressource externe', () => {
    const doc = receiptDocument(input);
    expect(doc.assets).toEqual(fontAssets());
    expect(doc.html).not.toMatch(/https?:\/\//);
  });
});
