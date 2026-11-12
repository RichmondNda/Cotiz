import { FEATURE_SPECS, FEATURES, type Feature } from '@cotiz/contracts';

/**
 * Fonctionnalités livrées (lot terminé ou en cours de clôture) : à compléter par chaque lot qui en livre une
 * (`/fin-lot`). Une fonctionnalité absente de `GET /me` affiche « Bientôt disponible » (architecture/10).
 */
export const DELIVERED_FEATURES: readonly Feature[] = [
  'payments',
  'activation_codes',
  'password_reset_manual',
  'contracts',
  'realtime',
  'web_push',
  'imports',
  'auto_reminders',
  'team',
];

export interface WebPushConfig {
  VAPID_PUBLIC_KEY?: string | undefined;
  VAPID_PRIVATE_KEY?: string | undefined;
  WEB_PUSH_HOSTS?: string | undefined;
}

/**
 * Web Push utilisable (lot 4.2) : paire VAPID et au moins un service de push accepté (`WEB_PUSH_HOSTS`). La liste
 * n'est jamais écrite dans le code (aucun hôte de fournisseur, lot 3.5) : fournie par la configuration du déploiement.
 */
export function webPushConfigured(config: WebPushConfig): boolean {
  const hosts = (config.WEB_PUSH_HOSTS ?? '').split(',').some((h) => h.trim().length > 0);
  return Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) && hosts;
}

/** Livrées et utilisables dans ce déploiement : le push standard (`web_push`) seulement s'il est configuré. */
export function deliveredFeatures(config: WebPushConfig): Feature[] {
  const push = webPushConfigured(config);
  return DELIVERED_FEATURES.filter((f) => f !== 'web_push' || push);
}

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
