import { FEATURE_SPECS, FEATURES, type Feature } from '@cotiz/contracts';

/**
 * Fonctionnalités livrées (lot terminé ou en cours de clôture) : à compléter par chaque lot qui en livre une
 * (`/fin-lot`). Une fonctionnalité absente de `GET /me` affiche « Bientôt disponible » (architecture/10).
 */
export const DELIVERED_FEATURES: readonly Feature[] = ['password_reset_manual'];

/**
 * Fonctionnalités actives (docs/specs/features.yaml) : livrées ; si `planGated`, contenues dans le plan de
 * l'association (`planFeatures`, `null` hors association ou avant les plans du lot 1.2) ; jamais celles d'un
 * fournisseur externe (groupe 6 : canal configuré, non livré). Ordre de features.yaml.
 */
export function activeFeatures(
  context: { planFeatures: readonly Feature[] | null },
  delivered: readonly Feature[] = DELIVERED_FEATURES,
): Feature[] {
  return FEATURES.filter((feature) => {
    const spec = FEATURE_SPECS[feature];
    if (!delivered.includes(feature) || spec.externalProvider) return false;
    return !spec.planGated || (context.planFeatures?.includes(feature) ?? false);
  });
}
