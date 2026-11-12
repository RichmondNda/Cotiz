import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';
import { columnLetter, guessMapping, samplesOf, toImportTable } from './import-table.js';
import { checkRow, mappingProblem, normalizeImportPhone, phoneRegionOf, valuesOf } from './row-check.js';

const csv = (text: string, encoding: BufferEncoding = 'utf8') => parseCsv(Buffer.from(text, encoding));

describe('parseCsv', () => {
  it('séparateur ; d’Excel, guillemets, CRLF, BOM', () => {
    expect(csv('\uFEFFPrénom;NOM;Tel\r\n"Aïcha";"Bamba; fille";0712345678\r\n')).toEqual([
      ['Prénom', 'NOM', 'Tel'],
      ['Aïcha', 'Bamba; fille', '0712345678'],
    ]);
  });

  it('séparateur , et tabulation détectés sur l’en-tête', () => {
    expect(csv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(csv('a\tb\n1\t2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('guillemet doublé et retour à la ligne dans un champ', () => {
    expect(csv('a;b\n"dit ""oui""";"ligne\nsuite"')).toEqual([
      ['a', 'b'],
      ['dit "oui"', 'ligne\nsuite'],
    ]);
  });

  it('Windows-1252 quand le texte n’est pas de l’UTF-8', () => {
    expect(csv('Prénom;Quartier\nAïcha;Cocody', 'latin1')).toEqual([
      ['Prénom', 'Quartier'],
      ['Aïcha', 'Cocody'],
    ]);
  });

  it('contenu binaire : null', () => {
    expect(parseCsv(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]))).toBeNull();
  });
});

describe('toImportTable', () => {
  it('en-tête = première ligne non vide, lignes vides sautées, numéros de ligne du fichier', () => {
    const table = toImportTable([[], ['Prénom', ' NOM ', ''], ['Aïcha', 'Bamba'], ['', ''], ['Yao', '  Kouamé ', 'x']]);
    expect(table).toEqual({
      headers: ['Prénom', 'NOM'],
      lines: [
        { rowNumber: 3, cells: { Prénom: 'Aïcha', NOM: 'Bamba' } },
        { rowNumber: 5, cells: { Prénom: 'Yao', NOM: 'Kouamé' } },
      ],
    });
  });

  it('colonnes sans nom ou en double renommées', () => {
    const table = toImportTable([
      ['Nom', '', 'Nom'],
      ['a', 'b', 'c'],
    ]);
    expect(table !== 'empty' && table !== 'too_many_rows' && table.headers).toEqual(['Nom', 'Colonne B', 'Nom (2)']);
  });

  it('sans donnée : empty ; au-delà de 5 000 lignes : too_many_rows', () => {
    expect(toImportTable([])).toBe('empty');
    expect(toImportTable([['Nom']])).toBe('empty');
    const rows = Array.from({ length: 5000 }, (_, i) => [`n${String(i)}`]);
    expect(toImportTable([['Nom'], ...rows])).not.toBe('too_many_rows');
    expect(toImportTable([['Nom'], ...rows, ['un de trop']])).toBe('too_many_rows');
  });

  it('lettres de colonnes et exemples', () => {
    expect([0, 25, 26, 51].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AZ']);
    const lines = [1, 2, 3, 4].map((n) => ({ rowNumber: n + 1, cells: { Tel: n === 2 ? '' : `0${String(n)}` } }));
    expect(samplesOf(lines, 'Tel')).toEqual(['01', '03', '04']);
  });
});

describe('guessMapping', () => {
  it('noms de la maquette et variantes', () => {
    expect(guessMapping(['Prénom', 'NOM', 'Tél.', 'Mail', 'Quartier', 'Cotisation'])).toEqual({
      Prénom: 'firstName',
      NOM: 'lastName',
      'Tél.': 'phone',
      Mail: 'email',
      Quartier: 'address',
      Cotisation: null,
    });
  });

  it('un champ va à une seule colonne (la première)', () => {
    expect(guessMapping(['Téléphone', 'Mobile'])).toEqual({ Téléphone: 'phone', Mobile: null });
  });
});

describe('mappingProblem', () => {
  const headers = ['P', 'N', 'T'];
  it('complet : null', () => {
    expect(mappingProblem({ P: 'firstName', N: 'lastName', T: 'phone' }, headers)).toBeNull();
  });
  it('champ obligatoire absent, colonne inconnue', () => {
    expect(mappingProblem({ P: 'firstName', N: 'lastName', T: null }, headers)).toEqual({
      'mapping.phone': 'required',
    });
    expect(mappingProblem({ P: 'firstName', N: 'firstName', T: 'phone' }, headers)).toEqual({
      'mapping.lastName': 'required',
    });
    expect(mappingProblem({ P: 'firstName', N: 'lastName', T: 'phone', X: 'email' }, headers)).toEqual({
      mapping: 'unknown_column',
    });
  });
  it('deux colonnes sur le même champ', () => {
    expect(
      mappingProblem({ P: 'firstName', N: 'lastName', T: 'phone', A: 'email', B: 'email' }, [...headers, 'A', 'B']),
    ).toEqual({ 'mapping.email': 'duplicate' });
  });
});

describe('normalizeImportPhone', () => {
  it('numéro national du pays de l’association, international, zéro perdu par Excel', () => {
    expect(normalizeImportPhone('07 12 34 56 78', 'CI')).toBe('+2250712345678');
    expect(normalizeImportPhone('+225 07 12 34 56 78', 'CI')).toBe('+2250712345678');
    expect(normalizeImportPhone('00225 0712345678', 'CI')).toBe('+2250712345678');
    expect(normalizeImportPhone('712345678', 'CI')).toBe('+2250712345678');
    expect(normalizeImportPhone('+221 77 123 45 67', 'CI')).toBe('+221771234567');
  });
  it('incomplet ou illisible : null', () => {
    expect(normalizeImportPhone('07 12 34', 'CI')).toBeNull();
    expect(normalizeImportPhone('abc', 'CI')).toBeNull();
  });
});

describe('checkRow', () => {
  const mapping = { Prénom: 'firstName', NOM: 'lastName', Tel: 'phone', Mail: 'email' } as const;

  it('ligne prête', () => {
    const values = valuesOf({ Prénom: 'Aïcha', NOM: 'Bamba', Tel: '0712345678', Mail: '' }, mapping);
    expect(checkRow(values, 'CI')).toEqual({ values, phone: '+2250712345678', errors: [] });
  });

  it('prénom manquant, téléphone incomplet, email invalide', () => {
    const values = valuesOf({ Prénom: '', NOM: 'Kouamé', Tel: '07 12 34', Mail: 'yao@' }, mapping);
    expect(checkRow(values, 'CI').errors).toEqual([
      { field: 'firstName', code: 'required' },
      { field: 'phone', code: 'invalid_phone' },
      { field: 'email', code: 'invalid_email' },
    ]);
  });

  it('les corrections du gestionnaire priment sur le fichier', () => {
    const values = valuesOf({ Prénom: '', NOM: 'Kouamé', Tel: '07 12 34' }, mapping, {
      firstName: ' Yao ',
      phone: '0712345679',
    });
    expect(checkRow(values, 'CI')).toMatchObject({ phone: '+2250712345679', errors: [] });
  });

  it('trop long', () => {
    const values = valuesOf({ Prénom: 'x'.repeat(81), NOM: 'B', Tel: '0712345678' }, mapping);
    expect(checkRow(values, 'CI').errors).toEqual([{ field: 'firstName', code: 'too_long' }]);
  });
});

describe('phoneRegionOf (pays de l’association, texte libre)', () => {
  it('code ISO, nom avec accents et apostrophe typographique, inconnu → Côte d’Ivoire', () => {
    expect(phoneRegionOf('ci')).toBe('CI');
    expect(phoneRegionOf('Côte d’Ivoire')).toBe('CI');
    expect(phoneRegionOf("Cote d'Ivoire")).toBe('CI');
    expect(phoneRegionOf('Sénégal')).toBe('SN');
    expect(phoneRegionOf('Burkina Faso')).toBe('BF');
    expect(phoneRegionOf('Atlantide')).toBe('CI');
  });

  it('numéro national lu dans le pays donné en toutes lettres', () => {
    expect(normalizeImportPhone('0712345678', 'Côte d’Ivoire')).toBe('+2250712345678');
  });
});
