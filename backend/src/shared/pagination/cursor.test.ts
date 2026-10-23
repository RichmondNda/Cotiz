import { describe, expect, it } from 'vitest';
import { containsPattern, decodeCursor, encodeCursor } from './cursor.js';

describe('curseur de liste', () => {
  it('aller-retour, date PostgreSQL à la microseconde conservée', () => {
    const cursor = { at: '2026-10-01 08:00:00.123456+00', id: '00000000-0000-7000-8000-0000000014c1' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ['pas du base64', 'pas un curseur'],
    ['JSON illisible', Buffer.from('{').toString('base64url')],
    ['forme fausse', Buffer.from(JSON.stringify({ at: 1 })).toString('base64url')],
    [
      'date invalide',
      Buffer.from(JSON.stringify({ at: 'hier', id: '00000000-0000-7000-8000-0000000014c1' })).toString('base64url'),
    ],
    ['id invalide', Buffer.from(JSON.stringify({ at: '2026-10-01', id: 'x' })).toString('base64url')],
    ...['1', '2026-10-01', '2026-02-30 08:00:00+00', '2026-13-01 08:00:00+00', '2026-10-01T08:00:00Z'].map((at) => [
      `date hors format PostgreSQL (${at})`,
      Buffer.from(JSON.stringify({ at, id: '00000000-0000-7000-8000-0000000014c1' })).toString('base64url'),
    ]),
  ])('%s : null', (_name, value) => {
    expect(decodeCursor(value)).toBeNull();
  });
});

describe('containsPattern', () => {
  it('échappe les jokers ILIKE', () => {
    expect(containsPattern('100%_a\\b')).toBe('%100\\%\\_a\\\\b%');
  });
});
