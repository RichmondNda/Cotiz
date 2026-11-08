import { FEATURE_SPECS, FEATURES } from '@cotiz/contracts';
import { describe, expect, it } from 'vitest';
import { activeFeatures, DELIVERED_FEATURES } from './active-features.js';

describe('activeFeatures (docs/specs/features.yaml)', () => {
  const ungated = DELIVERED_FEATURES.filter((f) => !FEATURE_SPECS[f].planGated);

  it('par défaut : les fonctionnalités livrées seulement, hors celles soumises au plan', () => {
    expect(activeFeatures({ planFeatures: null })).toEqual(ungated);
    expect(activeFeatures({ planFeatures: ['contracts'] })).toEqual([...ungated, 'contracts']);
    expect(activeFeatures({ planFeatures: null }, ['password_reset_manual'])).toEqual(['password_reset_manual']);
  });

  it('une fonctionnalité du plan n’est active qu’avec un plan qui la contient', () => {
    const gated = FEATURES.filter((f) => FEATURE_SPECS[f].planGated && !FEATURE_SPECS[f].externalProvider);
    const delivered = [...DELIVERED_FEATURES, ...gated];
    expect(activeFeatures({ planFeatures: null }, delivered)).toEqual(ungated);
    expect(activeFeatures({ planFeatures: ['team'] }, delivered)).toContain('team');
    expect(activeFeatures({ planFeatures: ['team'] }, delivered)).not.toContain('exports');
  });

  it('fournisseur externe (groupe 6) : jamais actif tant que son canal n’est pas configuré', () => {
    expect(activeFeatures({ planFeatures: ['channel_email'] }, ['channel_email', 'online_payment'])).toEqual([]);
  });

  it('l’ordre suit features.yaml, sans doublon', () => {
    expect(activeFeatures({ planFeatures: null }, ['realtime', 'payments', 'realtime'])).toEqual([
      'payments',
      'realtime',
    ]);
  });
});
