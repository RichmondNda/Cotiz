import { z } from 'zod';
import { FEATURES } from '../generated/features.js';
import { Money, Uuid } from './scalars.js';

export const FeatureSchema = z.enum(FEATURES);

/** Limite d'un plan ; `null` = illimité. */
export const Quota = z.int().nonnegative().nullable();

/** Plan tel qu'affiché sur la landing et le formulaire de demande. */
export const PublicPlan = z
  .object({
    id: Uuid,
    code: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable(),
    priceMonthly: Money,
    priceYearly: Money,
    limits: z.object({ projects: Quota, subscribers: Quota, managers: Quota }),
    /** Fonctionnalités incluses (clés de features.yaml soumises au plan). */
    features: z.array(FeatureSchema),
    /** « Le plus choisi » sur la landing. */
    isFeatured: z.boolean(),
  })
  .meta({ id: 'PublicPlan' });
export type PublicPlan = z.infer<typeof PublicPlan>;

/** Plan vu par le super-admin, archivés compris. */
export const Plan = PublicPlan.extend({
  isActive: z.boolean(),
  archivedAt: z.iso.datetime().nullable(),
  /** Associations abonnées à ce plan. */
  subscribersCount: z.int().nonnegative(),
  /** Verrouillage optimiste (`If-Match` de `pf.plan.write`). */
  version: z.int().min(1),
}).meta({ id: 'Plan' });
export type Plan = z.infer<typeof Plan>;

/** Jauge d'un quota : utilisé / limite (`null` = illimité). */
export const QuotaUsage = z.object({ used: z.int().nonnegative(), limit: Quota }).meta({ id: 'QuotaUsage' });

export const PlanRef = z.object({ id: Uuid, code: z.string(), name: z.string() }).meta({ id: 'PlanRef' });
