import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { readSpreadsheet } from './spreadsheet-reader.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function xlsx(rows: unknown[][], extraSheet = false): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Membres');
  for (const row of rows) sheet.addRow(row);
  if (extraSheet) workbook.addWorksheet('Autre').addRow(['ignorée']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('readSpreadsheet', () => {
  it('XLSX : première feuille, nombres sans exposant, dates, formules, textes enrichis', async () => {
    const content = await xlsx(
      [
        ['Prénom', 'NOM', 'Tel', 'Né le', 'Total'],
        [
          { richText: [{ text: 'Aï' }, { text: 'cha' }] },
          'Bamba',
          712345678,
          new Date('1990-05-04'),
          { formula: '1+1', result: 2 },
        ],
        [],
        ['Yao', 'Kouamé', '+2250501020304'],
      ],
      true,
    );
    expect(await readSpreadsheet(content, XLSX)).toEqual([
      ['Prénom', 'NOM', 'Tel', 'Né le', 'Total'],
      ['Aïcha', 'Bamba', '712345678', '1990-05-04', '2'],
      [],
      ['Yao', 'Kouamé', '+2250501020304'],
    ]);
  });

  it('XLSX trop long : lecture arrêtée, too_many_rows', async () => {
    const rows = Array.from({ length: 6100 }, (_, i) => [`n${String(i)}`]);
    expect(await readSpreadsheet(await xlsx(rows), XLSX)).toBe('too_many_rows');
  });

  it('fichier illisible : unreadable', async () => {
    expect(await readSpreadsheet(Buffer.from('pas un zip'), XLSX)).toBe('unreadable');
    expect(await readSpreadsheet(Buffer.from([0, 1, 2, 3]), 'text/csv')).toBe('unreadable');
  });

  it('CSV', async () => {
    expect(await readSpreadsheet(Buffer.from('a;b\n1;2'), 'text/csv')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});
