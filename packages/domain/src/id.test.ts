import { beforeEach, describe, expect, it, vi } from 'vitest';

// Module rechargé à chaque test : l'état interne (dernière milliseconde, compteur) ne fuit pas d'un test à l'autre.
let newId: (now?: number) => string;
beforeEach(async () => {
  vi.resetModules();
  ({ newId } = await import('./id.js'));
});

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const timestamp = (id: string) => parseInt(id.replaceAll('-', '').slice(0, 12), 16);
const T = Date.UTC(2026, 8, 29, 10, 0, 0);

describe('newId — UUID v7', () => {
  it('format RFC 9562 : version 7, variante 10', () => {
    for (let i = 0; i < 100; i++) expect(newId()).toMatch(UUID_V7);
  });

  it('les 48 premiers bits sont l’horodatage en millisecondes', () => {
    expect(timestamp(newId(T))).toBe(T);
    expect(timestamp(newId(0))).toBe(T); // horloge qui recule : on garde la dernière milliseconde
  });

  it('strictement croissant, même dans une même milliseconde', () => {
    const ids = Array.from({ length: 5000 }, () => newId(T));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('compteur épuisé : l’horodatage avance d’une seule milliseconde', () => {
    const ids = Array.from({ length: 4097 }, () => newId(T));
    // Le compteur démarre sous 2 048 : 4 097 identifiants débordent forcément, d'une seule milliseconde.
    expect([...new Set(ids.map(timestamp))].sort()).toEqual([T, T + 1]);
    expect([...ids].sort()).toEqual(ids);
    for (let i = 0; i < 5000; i++) newId(T);
    expect(timestamp(newId(T))).toBeLessThanOrEqual(T + 3);
  });

  it('reste croissant si l’horloge recule', () => {
    const a = newId(T + 3_600_000);
    const b = newId(T);
    expect(b > a).toBe(true);
    expect(b).toMatch(UUID_V7);
  });

  it.each([Number.NaN, -1, 1.5, 2 ** 48, Number.POSITIVE_INFINITY])('refuse l’horodatage %s', (now) => {
    expect(() => newId(now)).toThrow(RangeError);
  });

  it('identifiants uniques sur 10 000 tirages', () => {
    expect(new Set(Array.from({ length: 10_000 }, () => newId())).size).toBe(10_000);
  });
});
