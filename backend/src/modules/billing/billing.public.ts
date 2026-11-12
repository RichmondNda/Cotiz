// Surface du module billing pour les autres modules et les scripts (architecture/01).
export { SeedDevPlansUseCase } from './application/seed-dev-plans.use-case.js';
export { SeedDevSubscriptionsUseCase } from './application/seed-dev-subscriptions.use-case.js';
export { PROJECT_QUOTA_STATUSES, type QuotaKind, quotaOf, QuotaService } from './application/quota.service.js';
export { isActivePlan, planRefsOf } from './application/plan-records.js';
export { type NewSubscription, openSubscription, setManagerSeats } from './application/open-subscription.js';
export {
  type CurrentSubscription,
  currentSubscriptionOf,
  displayedPlansOf,
  latestSubscriptionOf,
  platformCurrentSubscriptions,
  type SubscriptionStanding,
} from './application/subscription-views.js';
// Contrats (lot 4.1) : fonctionnalités du plan, `feature_disabled`.
export { assertPlanFeature, planFeaturesOf } from './application/plan-features.js';
