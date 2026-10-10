import { readFileSync } from 'node:fs';
import { collectDefaultMetrics, Registry } from 'prom-client';
import { describe, expect, it } from 'vitest';
import { METRIC_NAMES } from './metric-names.js';

/**
 * Tableau Grafana « Santé API » (infra/grafana/, importé au lot 7.1) : JSON valide, et chaque requête PromQL ne cite
 * que des métriques réellement exportées par l'api ou le worker.
 */
const dashboard = JSON.parse(
  readFileSync(new URL('../../../../infra/grafana/sante-api.json', import.meta.url), 'utf8'),
) as {
  title: string;
  uid: string;
  panels: { title: string; type: string; targets?: { expr: string }[] }[];
};

/** Séries exportées : les nôtres et celles de prom-client (processus, Node). Suffixes d'histogramme inclus. */
function exportedSeries(): Set<string> {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  const names = [...METRIC_NAMES, ...registry.getMetricsAsArray().map((m) => m.name)];
  return new Set(names.flatMap((name) => [name, `${name}_bucket`, `${name}_sum`, `${name}_count`]));
}

const PROMQL_FUNCTIONS = new Set([
  'sum',
  'rate',
  'irate',
  'by',
  'histogram_quantile',
  'max',
  'min',
  'avg',
  'clamp_min',
  'increase',
  'without',
  'le',
  'or',
  'vector',
  'on',
]);

describe('tableau Grafana « Santé API »', () => {
  it('est un tableau identifié avec des panneaux', () => {
    expect(dashboard.title).toBe('Santé API');
    expect(dashboard.uid).toMatch(/^[a-z0-9-]+$/);
    expect(dashboard.panels.length).toBeGreaterThanOrEqual(6);
  });

  it('ne cite que des métriques exportées', () => {
    const exported = exportedSeries();
    const exprs = dashboard.panels.flatMap((p) => (p.targets ?? []).map((t) => ({ panel: p.title, expr: t.expr })));
    expect(exprs.length).toBeGreaterThan(0);
    for (const { panel, expr } of exprs) {
      // Identifiants hors chaînes, étiquettes (sélecteurs et regroupements), durées et nombres : noms de métriques
      // ou fonctions PromQL.
      const bare = expr
        .replace(/"[^"]*"/g, '')
        .replace(/\b(by|without)\s*\([^)]*\)/g, '')
        .replace(/\{[^}]*\}/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\b\d+(\.\d+)?(e[-+]?\d+)?\b/gi, '');
      const metrics = (bare.match(/[a-z_][a-z0-9_]*/g) ?? []).filter((id) => !PROMQL_FUNCTIONS.has(id));
      expect(metrics.length, `${panel} : aucune métrique`).toBeGreaterThan(0);
      for (const metric of metrics) expect(exported.has(metric), `${panel} : ${metric} inconnue`).toBe(true);
    }
  });

  it('couvre les RED, les files et l’outbox', () => {
    const all = dashboard.panels
      .flatMap((p) => p.targets ?? [])
      .map((t) => t.expr)
      .join('\n');
    for (const metric of [
      'cotiz_http_requests_total',
      'cotiz_http_request_duration_seconds_bucket',
      'cotiz_queue_jobs',
      'cotiz_outbox_oldest_unpublished_age_seconds',
    ]) {
      expect(all).toContain(metric);
    }
  });
});
