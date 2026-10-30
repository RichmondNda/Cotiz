import { z } from 'zod';

/**
 * Curseur opaque des listes (architecture/06) : position de la dernière ligne servie, dans l'ordre (date, id). La date
 * est le texte exact de PostgreSQL (microsecondes), jamais une `Date` JavaScript arrondie à la milliseconde : une ligne
 * reçue dans la même milliseconde serait sinon resservie ou perdue.
 */
export interface Cursor {
  at: string;
  id: string;
}

/** Texte d'un `timestamptz` tel que PostgreSQL le sert (`2026-10-01 08:00:00.123456+00`), rien de plus permissif. */
const PG_TIMESTAMPTZ = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;

const Shape = z.object({ at: z.string().regex(PG_TIMESTAMPTZ), id: z.uuid() });

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** `null` si le curseur est illisible (à signaler en `validation_failed` sur `cursor`). */
export function decodeCursor(value: string): Cursor | null {
  try {
    const parsed = Shape.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (!parsed.success) return null;
    // Date réelle (pas de 30 février) : sinon PostgreSQL refuserait le cast (500 au lieu de 422).
    const [date = ''] = parsed.data.at.split(' ');
    return new Date(`${date}T00:00:00Z`).toISOString().startsWith(date) ? parsed.data : null;
  } catch {
    return null;
  }
}

const SerialShape = z.object({ at: z.string().regex(PG_TIMESTAMPTZ), id: z.string().regex(/^[1-9]\d{0,18}$/) });

/** Curseur d'une table à identifiant séquentiel (bigserial, ex. audit_logs) : même forme, `id` en chiffres. */
export function encodeSerialCursor(cursor: Cursor): string {
  return encodeCursor(cursor);
}

/** `null` si le curseur est illisible. */
export function decodeSerialCursor(value: string): Cursor | null {
  try {
    const parsed = SerialShape.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (!parsed.success) return null;
    const [date = ''] = parsed.data.at.split(' ');
    return new Date(`${date}T00:00:00Z`).toISOString().startsWith(date) ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Motif ILIKE « contient » : `%`, `_` et `\` sont des caractères, pas des jokers. */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
