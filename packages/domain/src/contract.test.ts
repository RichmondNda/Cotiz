import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CONTRACT_VARIABLES, contractValues, renderContract, type ContractContext } from './contract.js';

const NNBSP = '\u202f';
/** Avant le symbole : U+00A0 (formatMoney). */
const NBSP = '\u00a0';

/** Centre communautaire (seed-reference) : 25 000 F par mois, 24 échéances, 50 000 F à l'entrée. */
const centre: ContractContext = {
  associationName: 'Entraide Yopougon',
  projectName: 'Centre communautaire',
  currency: 'XOF',
  entryFee: 50000,
  installmentAmount: 25000,
  frequency: 'monthly',
  dueDay: 5,
  startDate: '2026-03-01',
  schedule: [
    { kind: 'entry_fee', amountDue: 50000 },
    ...Array.from({ length: 24 }, () => ({ kind: 'periodic' as const, amountDue: 25000 })),
  ],
};

describe('contractValues()', () => {
  it('valeurs du projet, montants au format F CFA, date en toutes lettres', () => {
    expect(contractValues(centre)).toEqual({
      association: 'Entraide Yopougon',
      projet: 'Centre communautaire',
      montant: `650${NNBSP}000${NBSP}F`,
      fonds_entree: `50${NNBSP}000${NBSP}F`,
      nb_echeances: '24',
      frequence: 'mensuelles',
      montant_echeance: `25${NNBSP}000${NBSP}F`,
      jour: '5',
      date_debut: '1 mars 2026',
    });
  });

  it('avec le souscripteur : son nom et son téléphone groupé par deux chiffres', () => {
    const values = contractValues({
      ...centre,
      subscriber: { firstName: 'Moussa', lastName: 'Traoré', phone: '+2250700000011' },
    });
    expect(values.nom_souscripteur).toBe('Moussa Traoré');
    expect(values.telephone).toBe('+225 07 00 00 00 11');
  });

  it('téléphone hors format international : gardé tel quel', () => {
    const values = contractValues({
      ...centre,
      subscriber: { firstName: 'Awa', lastName: 'K', phone: '07 00 00 00 11' },
    });
    expect(values.telephone).toBe('07 00 00 00 11');
  });

  it('souscripteur sans téléphone ni nom de famille', () => {
    const values = contractValues({ ...centre, subscriber: { firstName: 'Awa', lastName: '', phone: null } });
    expect(values.nom_souscripteur).toBe('Awa');
    expect(values.telephone).toBe('non renseigné');
  });

  it('cycle roulant : ni total ni nombre d’échéances ; montant = montant d’une échéance', () => {
    const values = contractValues({ ...centre, entryFee: null, schedule: null, frequency: 'weekly' });
    expect(values.montant).toBe(`25${NNBSP}000${NBSP}F`);
    expect(values.nb_echeances).toBeUndefined();
    expect(values.fonds_entree).toBe(`0${NBSP}F`);
    expect(values.frequence).toBe('hebdomadaires');
  });

  it('sans date d’entrée : la variable reste à remplir', () => {
    expect(contractValues({ ...centre, startDate: null }).date_debut).toBeUndefined();
  });

  it.each([
    ['quarterly', 'trimestrielles'],
    ['semiannual', 'semestrielles'],
    ['annual', 'annuelles'],
  ] as const)('fréquence %s → %s', (frequency, word) => {
    expect(contractValues({ ...centre, frequency }).frequence).toBe(word);
  });
});

describe('renderContract()', () => {
  it('remplace les variables connues, garde les autres et celles sans valeur', () => {
    expect(
      renderContract('Je soussigné(e) {nom_souscripteur}, {telephone}, verse {montant} ; {inconnue} {jour}', {
        nom_souscripteur: 'Moussa Traoré',
        montant: '650 000 F',
      }),
    ).toBe('Je soussigné(e) Moussa Traoré, {telephone}, verse 650 000 F ; {inconnue} {jour}');
  });

  it('chaque occurrence est remplacée', () => {
    expect(renderContract('{projet} — {projet}', { projet: 'Centre' })).toBe('Centre — Centre');
  });

  it('une valeur qui contient une variable n’est pas remplacée une seconde fois', () => {
    expect(renderContract('{nom_souscripteur} / {projet}', { nom_souscripteur: '{projet}', projet: 'X' })).toBe(
      '{projet} / X',
    );
  });

  it('les variables reconnues sont celles du front et des mocks', () => {
    expect(CONTRACT_VARIABLES).toEqual([
      'association',
      'nom_souscripteur',
      'telephone',
      'projet',
      'montant',
      'fonds_entree',
      'nb_echeances',
      'frequence',
      'montant_echeance',
      'jour',
      'date_debut',
    ]);
  });

  it('propriété : un modèle sans accolades est rendu tel quel', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.includes('{')),
        (template) => renderContract(template, contractValues(centre)) === template,
      ),
    );
  });

  it('propriété : rendu déterministe (même entrée, même texte, donc même empreinte)', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (template, name) => {
        const values = contractValues({ ...centre, subscriber: { firstName: name, lastName: '', phone: null } });
        return renderContract(template, values) === renderContract(template, values);
      }),
    );
  });
});
