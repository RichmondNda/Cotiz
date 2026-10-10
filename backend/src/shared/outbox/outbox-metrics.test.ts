import { Registry } from 'prom-client';
import { describe, expect, it } from 'vitest';
import type { TenantDatabase } from '../tenant-context/index.js';
import { OutboxMetrics } from './outbox-metrics.js';

/** Valeur d'une série sans étiquette (hors `service`). */
async function value(registry: Registry, name: string): Promise<number | undefined> {
  const metric = (await registry.getMetricsAsJSON()).find((m) => m.name === name);
  return metric?.values[0]?.value;
}

/** `withTenantContext` simulé : renvoie directement le résultat choisi (la requête réelle est testée en intégration). */
function fakeDb(result: () => Promise<unknown>) {
  let calls = 0;
  const db = {
    withTenantContext: () => {
      calls++;
      return result();
    },
  } as unknown as TenantDatabase;
  return { db, calls: () => calls };
}

describe('OutboxMetrics', () => {
  it('une seule requête par scrape pour les deux jauges', async () => {
    const registry = new Registry();
    const { db, calls } = fakeDb(() => Promise.resolve({ unpublished: 3, oldestAgeSeconds: 42 }));
    new OutboxMetrics(registry, db);
    await registry.metrics();
    expect(calls()).toBe(1);
    expect(await value(registry, 'cotiz_outbox_unpublished_events')).toBe(3);
    expect(await value(registry, 'cotiz_outbox_oldest_unpublished_age_seconds')).toBe(42);
  });

  it('base injoignable : valeur inconnue (NaN), jamais 0 qui se lirait « à jour », échec compté', async () => {
    const registry = new Registry();
    const { db } = fakeDb(() => Promise.reject(new Error('connect ECONNREFUSED')));
    new OutboxMetrics(registry, db);
    // prom-client écrit `Nan` : accepté par Prometheus (ParseFloat, insensible à la casse).
    const text = await registry.metrics();
    expect(text).toMatch(/^cotiz_outbox_oldest_unpublished_age_seconds nan$/im);
    expect(text).toMatch(/^cotiz_outbox_unpublished_events nan$/im);
    // Compteur enregistré avant les jauges : l’échec d’un scrape apparaît au suivant, une fois par requête.
    expect(await registry.metrics()).toMatch(/^cotiz_metrics_collect_errors_total\{collector="outbox"\} 1$/m);
  });

  it('la base revenue, la valeur réelle remplace NaN au scrape suivant', async () => {
    const registry = new Registry();
    let down = true;
    const { db } = fakeDb(() =>
      down ? Promise.reject(new Error('panne')) : Promise.resolve({ unpublished: 0, oldestAgeSeconds: 0 }),
    );
    new OutboxMetrics(registry, db);
    await registry.metrics();
    down = false;
    expect(await value(registry, 'cotiz_outbox_oldest_unpublished_age_seconds')).toBe(0);
  });
});
