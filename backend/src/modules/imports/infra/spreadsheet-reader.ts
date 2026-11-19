import { Readable } from 'node:stream';
import { IMPORT_MAX_ROWS } from '@cotiz/contracts';
import ExcelJS from 'exceljs';
import { parseCsv } from '../domain/csv.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Lignes au-delà desquelles la lecture d'une feuille s'arrête : en-tête, IMPORT_MAX_ROWS lignes, et de la marge pour
 * des lignes vides. Un XLSX de 5 Mo peut décrire des millions de cellules : jamais lu en entier.
 */
const READ_LIMIT = IMPORT_MAX_ROWS + 1000;

export type Spreadsheet = string[][] | 'unreadable' | 'too_many_rows';

/**
 * Contenu d'un fichier d'import → tableau de textes (une ligne par ligne du fichier, à son rang). XLSX : première
 * feuille, lue en flux ; nombres, dates (AAAA-MM-JJ), formules (résultat), textes enrichis et liens rendus en texte.
 */
export async function readSpreadsheet(content: Buffer, mimeType: string): Promise<Spreadsheet> {
  if (mimeType !== XLSX) return parseCsv(content) ?? 'unreadable';
  try {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(content), {
      sharedStrings: 'cache',
      hyperlinks: 'ignore',
      styles: 'cache',
      worksheets: 'emit',
      entries: 'emit',
    });
    const matrix: string[][] = [];
    for await (const sheet of reader) {
      for await (const row of sheet) {
        if (row.number > READ_LIMIT) return 'too_many_rows';
        const values = Array.isArray(row.values) ? (row.values as unknown[]) : [];
        // `values` commence à l'indice 1 (colonne A).
        matrix[row.number - 1] = values.slice(1).map(cellText);
      }
      break;
    }
    for (let i = 0; i < matrix.length; i++) matrix[i] ??= [];
    return matrix;
  } catch {
    return 'unreadable';
  }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isInteger(value) ? value.toFixed(0) : String(value);
  if (typeof value === 'boolean') return value ? 'VRAI' : 'FAUX';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as { richText?: { text?: string }[]; text?: unknown; result?: unknown };
    if (Array.isArray(v.richText)) return v.richText.map((part) => part.text ?? '').join('');
    if ('result' in v) return cellText(v.result);
    if ('text' in v) return cellText(v.text);
  }
  return '';
}
