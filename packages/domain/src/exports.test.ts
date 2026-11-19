import { describe, expect, it } from 'vitest';
import { EXPORT_LIMITS, EXPORT_RETENTION_DAYS, exportExpiresAt, exportQuotaIssue } from './exports.js';

describe('exportQuotaIssue — quota d’export (lot 4.6)', () => {
  it('aucun export en cours et moins de 20 aujourd’hui : accepté', () => {
    expect(exportQuotaIssue({ inProgress: 0, requestedToday: 0 })).toBeNull();
    expect(exportQuotaIssue({ inProgress: 0, requestedToday: 19 })).toBeNull();
  });

  it('un export déjà en attente ou en cours : refusé (limite 1)', () => {
    expect(exportQuotaIssue({ inProgress: 1, requestedToday: 1 })).toEqual({ limit: 1, usage: 1 });
  });

  it('20 exports demandés aujourd’hui : refusé (limite 20)', () => {
    expect(exportQuotaIssue({ inProgress: 0, requestedToday: 20 })).toEqual({ limit: 20, usage: 20 });
    expect(exportQuotaIssue({ inProgress: 0, requestedToday: 25 })).toEqual({ limit: 20, usage: 25 });
  });

  it('les deux limites dépassées : la limite des exports en cours est signalée en premier', () => {
    expect(exportQuotaIssue({ inProgress: 1, requestedToday: 20 })).toEqual({ limit: 1, usage: 1 });
  });

  it('compteurs invalides : erreur', () => {
    expect(() => exportQuotaIssue({ inProgress: -1, requestedToday: 0 })).toThrow();
    expect(() => exportQuotaIssue({ inProgress: 0, requestedToday: 1.5 })).toThrow();
  });

  it('limites du plan du lot', () => {
    expect(EXPORT_LIMITS).toEqual({ inProgress: 1, perDay: 20 });
  });
});

describe('exportExpiresAt — conservation 7 jours (architecture/08, cotiz-exports)', () => {
  it('7 × 24 h après la production du fichier', () => {
    expect(EXPORT_RETENTION_DAYS).toBe(7);
    expect(exportExpiresAt(new Date('2026-11-15T10:30:00Z')).toISOString()).toBe('2026-11-22T10:30:00.000Z');
  });
});
