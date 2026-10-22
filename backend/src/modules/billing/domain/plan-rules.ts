import { FEATURE_SPECS, FEATURES, type Feature } from '@cotiz/contracts';
import { DomainError, Money } from '@cotiz/domain';

/** Fonctionnalités qu'un plan peut inclure : les clés `planGated` de features.yaml (lot 1.2, choix Q4). */
export const PLAN_GATED_FEATURES: readonly Feature[] = FEATURES.filter((f) => FEATURE_SPECS[f].planGated);

export function isPlanGated(feature: string): feature is Feature {
  return (PLAN_GATED_FEATURES as readonly string[]).includes(feature);
}

/** Contenu d'un plan soumis aux règles (création, ou état fusionné d'une modification). */
export interface PlanDraft {
  priceMonthly: Money;
  priceYearly: Money;
  limits: { projects: number | null; subscribers: number | null; managers: number | null };
  features: readonly string[];
}

/**
 * Règles d'un plan, en plus du contrat : erreurs par champ (`validation_failed`), vide si le plan est valide.
 * - prix : montants entiers revalidés par `Money`, positifs ou nuls, dans une seule devise (celle du plan) ;
 * - quotas : `null` (illimité) ou entier positif ou nul ; au moins un compte gestionnaire (l'owner en est un) ;
 * - fonctionnalités : clés `planGated` seulement, sans doublon.
 */
export function planProblems(draft: PlanDraft): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const field of ['priceMonthly', 'priceYearly'] as const) {
    let price: Money;
    try {
      price = Money.check(draft[field]);
    } catch (error) {
      problems[field] = error instanceof DomainError ? error.code : 'invalid_amount';
      continue;
    }
    if (price.amount < 0) problems[field] = 'negative';
  }
  if (!problems.priceMonthly && !problems.priceYearly && draft.priceMonthly.currency !== draft.priceYearly.currency) {
    problems.priceYearly = 'currency_mismatch';
  }
  for (const quota of ['projects', 'subscribers', 'managers'] as const) {
    const value = draft.limits[quota];
    if (value === null) continue;
    if (!Number.isSafeInteger(value)) problems[`limits.${quota}`] = 'invalid';
    else if (value < 0) problems[`limits.${quota}`] = 'negative';
  }
  if (draft.limits.managers === 0) problems['limits.managers'] = 'too_small';
  if (draft.features.some((f) => !isPlanGated(f))) problems.features = 'not_plan_gated';
  else if (new Set(draft.features).size !== draft.features.length) problems.features = 'duplicate';
  return problems;
}

/** Code d'une copie : `<code>-copie`, puis `<code>-copie-2`, `-copie-3`… le premier libre. */
export function duplicateCode(code: string, taken: ReadonlySet<string>): string {
  const base = `${code}-copie`;
  if (!taken.has(base)) return base;
  for (let i = 2; ; i += 1) {
    const candidate = `${base}-${String(i)}`;
    if (!taken.has(candidate)) return candidate;
  }
}
