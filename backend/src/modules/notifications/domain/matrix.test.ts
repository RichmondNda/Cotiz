import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_MATRIX } from './matrix.js';

/** Événements d'events.yaml : type, lot et consommateurs (lecture ligne à ligne du format généré). */
function catalogue(): { type: string; lot: string; consumers: string[] }[] {
  const text = readFileSync(new URL('../../../../../docs/specs/events.yaml', import.meta.url), 'utf8');
  const events: { type: string; lot: string; consumers: string[] }[] = [];
  let section = '';
  for (const line of text.split('\n')) {
    const type = /^- type: (\S+)$/.exec(line);
    if (type?.[1]) {
      events.push({ type: type[1], lot: '', consumers: [] });
      continue;
    }
    const current = events.at(-1);
    if (!current) continue;
    const lot = /^ {2}lot: '([\d.]+)'$/.exec(line);
    if (lot?.[1]) current.lot = lot[1];
    const key = /^ {2}(\w+):/.exec(line);
    if (key?.[1]) section = key[1];
    const item = /^ {2}- '?(.*?)'?$/.exec(line);
    if (section === 'consumers' && item?.[1]) current.consumers.push(item[1]);
  }
  return events;
}

const lotNumber = (lot: string) => {
  const [major = 0, minor = 0] = lot.split('.').map(Number);
  return major * 100 + minor;
};

describe('matrice des notifications', () => {
  const events = catalogue();

  it('lit le catalogue (garde-fou du lecteur)', () => {
    expect(events.length).toBeGreaterThan(40);
    expect(events.find((e) => e.type === 'payment.validated')?.consumers).toContain(
      'notifications: souscripteur (in-app, push)',
    );
  });

  it('tout événement d’un lot ≤ 2.5 notifié selon events.yaml figure dans la matrice', () => {
    const notified = events
      .filter((e) => lotNumber(e.lot) <= lotNumber('2.5'))
      .filter((e) => e.consumers.some((c) => /^notifications(:|$)/.test(c) && !c.startsWith('notifications: aucune')))
      .map((e) => e.type);
    expect(notified.length).toBeGreaterThan(0);
    expect(notified.filter((type) => !Object.hasOwn(NOTIFICATION_MATRIX, type))).toEqual([]);
  });

  it('la matrice ne contient que des événements du catalogue, tous notifiés en in-app', () => {
    const known = new Set(events.map((e) => e.type));
    for (const [type, entry] of Object.entries(NOTIFICATION_MATRIX)) {
      expect({ type, known: known.has(type) }).toEqual({ type, known: true });
      expect(entry.channels).toContain('in_app');
    }
  });

  it('aucun canal externe en V1 : seulement in_app et push (ignoré jusqu’au lot 4.2)', () => {
    const channels = new Set(Object.values(NOTIFICATION_MATRIX).flatMap((e) => [...e.channels]));
    expect([...channels].sort()).toEqual(['in_app', 'push']);
  });
});
