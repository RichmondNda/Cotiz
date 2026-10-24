import { describe, expect, it } from 'vitest';
import { PaymentMethodInput } from './payment-method.js';

// Lot 2.1 · étape 2 : `details` d'un moyen de paiement validé par type (exemples de docs/specs/seed-reference.yaml).

const orange = {
  kind: 'mobile_money',
  label: 'Orange Money',
  details: { operator: 'orange', number: '+2250708091011' },
};
const sgbci = {
  kind: 'bank_transfer',
  label: 'SGBCI',
  details: { bank: 'SGBCI', iban: 'CI93 CI00 8011 1234 5678 9012 34' },
};
const cash = { kind: 'cash', label: 'Espèces', details: {}, instructions: 'Remise au trésorier lors de la réunion' };

const issues = (value: unknown) => {
  const result = PaymentMethodInput.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('PaymentMethodInput : details validé par type', () => {
  it('exemples de référence acceptés ; actif par défaut', () => {
    for (const method of [orange, sgbci, cash, { ...cash, kind: 'other', label: 'Chèque' }]) {
      expect(issues(method)).toEqual([]);
    }
    expect(PaymentMethodInput.parse(orange).isActive).toBe(true);
  });

  it('mobile money : opérateur connu et numéro E.164 obligatoires', () => {
    expect(issues({ ...orange, details: { operator: 'Orange Money', number: '+2250708091011' } })).toEqual([
      'details.operator',
    ]);
    expect(issues({ ...orange, details: { operator: 'wave', number: '0708091011' } })).toEqual(['details.number']);
    expect(issues({ ...orange, details: { number: '+2250708091011' } })).toEqual(['details.operator']);
    expect(issues({ ...orange, details: { operator: 'mtn' } })).toEqual(['details.number']);
    for (const operator of ['orange', 'mtn', 'moov', 'wave']) {
      expect(issues({ ...orange, details: { operator, number: '+2250508091011' } })).toEqual([]);
    }
  });

  it('virement : IBAN obligatoire et bien formé (espaces et minuscules tolérés), banque facultative', () => {
    expect(issues({ ...sgbci, details: { iban: 'ci93ci0080111234567890123 4' } })).toEqual([]);
    expect(issues({ ...sgbci, details: { bank: 'SGBCI' } })).toEqual(['details.iban']);
    expect(issues({ ...sgbci, details: { iban: '0708091011' } })).toEqual(['details.iban']);
    expect(issues({ ...sgbci, details: { iban: 'CI93 CI00 80' } })).toEqual(['details.iban']);
    expect(issues({ ...sgbci, details: { iban: 'CI93 CI00 8011 1234 5678 9012 34', bank: '' } })).toEqual([
      'details.bank',
    ]);
  });

  it('espèces et autre : aucun détail, instructions obligatoires', () => {
    expect(issues({ ...cash, instructions: undefined })).toEqual(['instructions']);
    expect(issues({ ...cash, instructions: '   ' })).toEqual(['instructions']);
    expect(issues({ ...cash, details: { iban: 'CI93 CI00 8011 1234 5678 9012 34' } })).toEqual(['details']);
    const other = { ...cash, kind: 'other', label: 'Chèque' };
    expect(issues({ ...other, instructions: undefined })).toEqual(['instructions']);
    expect(issues({ ...other, details: { iban: 'CI93 CI00 8011 1234 5678 9012 34' } })).toEqual(['details']);
  });

  it('clé inconnue refusée, quel que soit le type', () => {
    expect(issues({ ...orange, details: { ...orange.details, pin: '1234' } })).toEqual(['details']);
    expect(issues({ ...sgbci, details: { ...sgbci.details, swift: 'SGCICIAB' } })).toEqual(['details']);
  });
});
