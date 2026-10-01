import { HealthLiveResponse, HealthReadyResponse } from '../system/health.js';
import { defineEndpoint, noFlags } from '../registry.js';

export const sysHealth = defineEndpoint({
  id: 'sys.health',
  space: 'system',
  permission: 'public',
  errors: [],
  flags: noFlags,
  operations: {
    live: {
      method: 'GET',
      path: '/api/v1/health/live',
      request: {},
      response: { status: 200, body: HealthLiveResponse },
    },
    /** 503 avec le même corps si une dépendance ne répond pas. */
    ready: {
      method: 'GET',
      path: '/api/v1/health/ready',
      request: {},
      response: { status: 200, body: HealthReadyResponse },
    },
  },
});
