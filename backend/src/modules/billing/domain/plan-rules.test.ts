import { describe, expect, it } from 'vitest';
import { duplicateCode, PLAN_GATED_FEATURES, type PlanDraft, planProblems } from './plan-rules.js';

const xof = (amount: number) => ({ amount, currency: 'XOF' as const });
const valid: PlanDraft = {
  priceMonthly: xof(10000),
  priceYearly: xof(120000),
  limits: { projects: 5, subscribers: 100, managers: 2 },
  features: ['contracts', 'auto_reminders'],
};

describe('règles d’un plan', () => {
  it('fonctionnalités soumises au plan : celles de features.yaml marquées planGated', () => {
    expect([...PLAN_GATED_FEATURES].sort()).toEqual(
      ['analytics', 'auto_reminders', 'contracts', 'exports', 'imports', 'public_api', 'reconciliation', 'team'].sort(),
    );
  });

  it('plan valide, gratuit, ou illimité : aucune erreur', () => {
    expect(planProblems(valid)).toEqual({});
    expect(planProblems({ ...valid, priceMonthly: xof(0), priceYearly: xof(0) })).toEqual({});
    expect(planProblems({ ...valid, limits: { projects: null, subscribers: null, managers: null } })).toEqual({});
  });

  it.each<[string, Partial<PlanDraft>, Record<string, string>]>([
    ['prix négatif', { priceMonthly: xof(-1) }, { priceMonthly: 'negative' }],
    ['montant non entier', { priceYearly: xof(0.5) }, { priceYearly: 'invalid_amount' }],
    ['devise inconnue', { priceYearly: { amount: 1, currency: 'EUR' as 'XOF' } }, { priceYearly: 'invalid_currency' }],
    ['deux devises', { priceYearly: { amount: 1, currency: 'XAF' } }, { priceYearly: 'currency_mismatch' }],
    ['quota négatif', { limits: { projects: -1, subscribers: 1, managers: 1 } }, { 'limits.projects': 'negative' }],
    [
      'aucun gestionnaire',
      { limits: { projects: 1, subscribers: 1, managers: 0 } },
      { 'limits.managers': 'too_small' },
    ],
    ['fonctionnalité hors plan', { features: ['payments'] }, { features: 'not_plan_gated' }],
    ['clé inconnue', { features: ['teleportation'] }, { features: 'not_plan_gated' }],
    ['doublon', { features: ['team', 'team'] }, { features: 'duplicate' }],
  ])('%s : erreur sur le champ', (_why, change, problems) => {
    expect(planProblems({ ...valid, ...change })).toEqual(problems);
  });

  it('code d’une copie : -copie, puis le premier -copie-N libre', () => {
    expect(duplicateCode('pro', new Set())).toBe('pro-copie');
    expect(duplicateCode('pro', new Set(['pro-copie']))).toBe('pro-copie-2');
    expect(duplicateCode('pro', new Set(['pro-copie', 'pro-copie-2', 'pro-copie-4']))).toBe('pro-copie-3');
  });
});
