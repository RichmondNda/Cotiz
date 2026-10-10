import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  ENDPOINT_IDS,
  ERRORS,
  ERROR_CODES,
  EVENTS,
  EVENT_TYPES,
  FEATURES,
  PERMISSIONS,
  STATUS_LABELS,
} from './index.js';

// Les unions de src/generated/ doivent refléter exactement docs/specs/*.yaml.
const specs = (file: string): unknown =>
  parse(readFileSync(fileURLToPath(new URL(`../../../docs/specs/${file}`, import.meta.url)), 'utf8'));
const sorted = (values: readonly string[]) => [...values].sort();

describe('unions générées depuis docs/specs', () => {
  it('ErrorCode = codes de errors.yaml, avec leur statut HTTP et leur message', () => {
    const { errors } = specs('errors.yaml') as { errors: { code: string; http: number; message: string }[] };
    expect(sorted(ERROR_CODES)).toEqual(sorted(errors.map((e) => e.code)));
    for (const e of errors) expect(ERRORS[e.code as keyof typeof ERRORS]).toEqual({ http: e.http, message: e.message });
  });

  it('EndpointId = ids de endpoints.yaml', () => {
    const { endpoints } = specs('endpoints.yaml') as { endpoints: { id: string }[] };
    expect(sorted(ENDPOINT_IDS)).toEqual(sorted(endpoints.map((e) => e.id)));
  });

  it('Permission = permissions de permissions.yaml', () => {
    const { permissions } = specs('permissions.yaml') as { permissions: { permission: string }[] };
    expect(sorted(PERMISSIONS)).toEqual(sorted(permissions.map((p) => p.permission)));
  });

  it('Feature = clés de features.yaml', () => {
    const { features } = specs('features.yaml') as { features: { key: string }[] };
    expect(sorted(FEATURES)).toEqual(sorted(features.map((f) => f.key)));
  });

  it('EventType = types de events.yaml', () => {
    const { events } = specs('events.yaml') as { events: { type: string }[] };
    expect(sorted(EVENT_TYPES)).toEqual(sorted(events.map((e) => e.type)));
  });

  it('EVENTS = version et clés du payload de events.yaml', () => {
    const { events } = specs('events.yaml') as { events: { type: string; version: number; payload: string[] }[] };
    expect(EVENTS).toEqual(Object.fromEntries(events.map((e) => [e.type, { version: e.version, payload: e.payload }])));
  });

  it('STATUS_LABELS = libellés et tons de status-mapping.yaml', () => {
    interface Entry {
      value: string;
      label: string;
      tone: string;
    }
    const { statuses } = specs('status-mapping.yaml') as { statuses: Record<string, Entry[]> };
    const expected = Object.fromEntries(
      Object.entries(statuses).map(([family, values]) => [
        family,
        Object.fromEntries(values.map((v) => [v.value, { label: v.label, tone: v.tone }])),
      ]),
    );
    expect(STATUS_LABELS).toEqual(expected);
  });

  // Lance un processus Node : plus de 5 s sur un runner de CI chargé (tests Testcontainers en parallèle).
  it('src/generated/ est à jour (gen --check)', { timeout: 30_000 }, () => {
    const script = fileURLToPath(new URL('../scripts/gen.mjs', import.meta.url));
    expect(() => execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
