import { describe, expect, it } from 'vitest';
import { csvDocument, membersCsv, projectReportCsv } from './export-csv.js';

const BOM = '\ufeff';
const xof = (amount: number) => ({ amount, currency: 'XOF' as const });

describe('csvDocument', () => {
  it('BOM UTF-8, « ; », chaque cellule entre guillemets, guillemets doublés, une ligne par enregistrement', () => {
    const text = csvDocument([
      ['Nom', 'Montant'],
      ['Awa "la grande"', 25000],
      ['Ligne\nsur deux', null],
    ]).toString('utf8');
    expect(text).toBe(`${BOM}"Nom";"Montant"\r\n"Awa ""la grande""";"25000"\r\n"Ligne\nsur deux";""\r\n`);
  });

  it('texte commençant par = + - @ ou tabulation : préfixé d’une apostrophe (pas de formule dans le tableur), sauf un numéro E.164', () => {
    const text = csvDocument([['=SOMME(A1)', '+A1', '-x', '@a', '\tb', 'ok', '+2250708091011']]).toString('utf8');
    expect(text).toBe(`${BOM}"'=SOMME(A1)";"'+A1";"'-x";"'@a";"'\tb";"ok";"+2250708091011"\r\n`);
  });

  it('un nombre négatif reste un nombre', () => {
    expect(csvDocument([[-5]]).toString('utf8')).toBe(`${BOM}"-5"\r\n`);
  });
});

describe('projectReportCsv — état des cotisations d’un projet', () => {
  it('mêmes colonnes que l’export du rapport, montants en entiers, dates JJ/MM/AAAA', () => {
    const text = projectReportCsv([
      {
        member: { id: 'm1', firstName: 'Kofi', lastName: 'Annan' },
        expectedToDate: xof(225000),
        paid: xof(50000),
        remaining: xof(175000),
        lateCount: 5,
        lastPaymentOn: '2026-04-06',
      },
      {
        member: { id: 'm2', firstName: 'Moussa', lastName: 'Diallo' },
        expectedToDate: xof(0),
        paid: xof(0),
        remaining: xof(0),
        lateCount: 0,
        lastPaymentOn: null,
      },
    ]).toString('utf8');
    expect(text.split('\r\n')).toEqual([
      `${BOM}"Souscripteur";"Attendu à date (F)";"Versé (F)";"Reste (F)";"Retards";"Dernier paiement"`,
      '"Kofi Annan";"225000";"50000";"175000";"5";"06/04/2026"',
      '"Moussa Diallo";"0";"0";"0";"0";""',
      '',
    ]);
  });
});

describe('membersCsv — annuaire des souscripteurs', () => {
  it('une ligne par personne, projets séparés par des virgules, statut en toutes lettres', () => {
    const text = membersCsv([
      {
        member: { id: 'm1', firstName: 'Awa', lastName: 'Koné', phone: '+2250708091011', email: null },
        projects: [
          { id: 'p1', name: 'Tontine 2026' },
          { id: 'p2', name: 'Fonds de secours' },
        ],
        totalPaid: xof(50000),
        totalRemaining: xof(25000),
        standing: 'late',
      },
    ]).toString('utf8');
    expect(text.split('\r\n')).toEqual([
      `${BOM}"Souscripteur";"Téléphone";"Email";"Projets";"Total versé (F)";"Total restant (F)";"Statut global"`,
      '"Awa Koné";"+2250708091011";"";"Tontine 2026, Fonds de secours";"50000";"25000";"En retard"',
      '',
    ]);
  });
});
