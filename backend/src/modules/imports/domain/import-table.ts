import { type ImportField, IMPORT_MAX_ROWS } from '@cotiz/contracts';
import type { z } from 'zod';

type Field = z.infer<typeof ImportField>;

/** Ligne de données : numéro de ligne dans le fichier (en-tête compris, comme dans Excel) et cellules par colonne. */
export interface ImportLine {
  rowNumber: number;
  cells: Record<string, string>;
}

export interface ImportTable {
  /** Noms des colonnes, uniques (vide → « Colonne C », doublon → « Nom (2) »). */
  headers: string[];
  lines: ImportLine[];
}

/**
 * Tableau lu (CSV ou première feuille XLSX) → en-tête et lignes de données. L'en-tête est la première ligne non vide ;
 * les lignes entièrement vides sont sautées, les cellules débarrassées de leurs espaces, celles au-delà de l'en-tête
 * ignorées. `empty` : pas d'en-tête ou aucune ligne de données ; `too_many_rows` : plus de IMPORT_MAX_ROWS lignes.
 */
export function toImportTable(matrix: readonly (readonly string[])[]): ImportTable | 'empty' | 'too_many_rows' {
  const clean = (cell: string | undefined) => (cell ?? '').replace(/\s+/g, ' ').trim();
  const headerIndex = matrix.findIndex((row) => row.some((cell) => clean(cell) !== ''));
  if (headerIndex < 0) return 'empty';
  const headerRow = matrix[headerIndex] ?? [];
  let width = headerRow.length;
  while (width > 0 && clean(headerRow[width - 1]) === '') width--;
  const headers = uniqueHeaders(Array.from({ length: width }, (_, i) => clean(headerRow[i])));

  const lines: ImportLine[] = [];
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const values = headers.map((_, c) => clean(row[c]));
    if (values.every((v) => v === '')) continue;
    if (lines.length === IMPORT_MAX_ROWS) return 'too_many_rows';
    lines.push({ rowNumber: i + 1, cells: Object.fromEntries(headers.map((h, c) => [h, values[c] ?? ''])) });
  }
  return lines.length === 0 ? 'empty' : { headers, lines };
}

function uniqueHeaders(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name, i) => {
    const base = name === '' ? `Colonne ${columnLetter(i)}` : name;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${String(n)})`;
  });
}

/** 0 → A, 25 → Z, 26 → AA (lettres d'Excel). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    letters = String.fromCharCode(65 + r) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Trois premières valeurs non vides d'une colonne (aperçu de la correspondance). */
export function samplesOf(lines: readonly ImportLine[], header: string): string[] {
  const samples: string[] = [];
  for (const line of lines) {
    const value = line.cells[header] ?? '';
    if (value !== '') samples.push(value.slice(0, 80));
    if (samples.length === 3) break;
  }
  return samples;
}

const SYNONYMS: Readonly<Record<Field, readonly string[]>> = {
  firstName: ['prenom', 'prenoms', 'firstname', 'first name', 'prenom s'],
  lastName: ['nom', 'nom de famille', 'lastname', 'last name', 'surname', 'nom famille'],
  phone: [
    'telephone',
    'tel',
    'phone',
    'mobile',
    'portable',
    'numero',
    'numero de telephone',
    'contact',
    'whatsapp',
    'cel',
    'cellulaire',
    'gsm',
  ],
  email: ['email', 'e mail', 'mail', 'courriel', 'adresse email', 'adresse mail', 'adresse e mail'],
  address: ['adresse', 'address', 'quartier', 'commune', 'ville', 'localite', 'domicile', 'lieu de residence'],
};

/** Nom de colonne comparable : minuscules, sans accents, ponctuation remplacée par des espaces. */
export function headerKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Correspondance proposée : chaque champ Cotiz va à la première colonne dont le nom est l'un de ses synonymes
 * (« Prénom », « NOM », « Tél. », « Mail », « Quartier »…) ; les autres colonnes sont ignorées (`null`).
 */
export function guessMapping(headers: readonly string[]): Record<string, Field | null> {
  const mapping: Record<string, Field | null> = Object.fromEntries(headers.map((h) => [h, null]));
  const taken = new Set<Field>();
  for (const header of headers) {
    const key = headerKey(header);
    const field = (Object.keys(SYNONYMS) as Field[]).find((f) => !taken.has(f) && SYNONYMS[f].includes(key));
    if (field) {
      mapping[header] = field;
      taken.add(field);
    }
  }
  return mapping;
}
