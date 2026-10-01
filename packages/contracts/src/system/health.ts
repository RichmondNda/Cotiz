import { z } from 'zod';

// sys.health — GET /api/v1/health/live et /api/v1/health/ready (docs/specs/endpoints.yaml, lot 0.1).

export const HealthLiveResponse = z.object({
  status: z.literal('ok'),
});
export type HealthLiveResponse = z.infer<typeof HealthLiveResponse>;

export const HealthCheckStatus = z.enum(['up', 'down']);
export type HealthCheckStatus = z.infer<typeof HealthCheckStatus>;

/** 200 si toutes les dépendances répondent, 503 sinon (même corps). */
export const HealthReadyResponse = z.object({
  status: z.enum(['ok', 'unavailable']),
  checks: z.object({
    postgres: HealthCheckStatus,
    redis: HealthCheckStatus,
    minio: HealthCheckStatus,
  }),
});
export type HealthReadyResponse = z.infer<typeof HealthReadyResponse>;
