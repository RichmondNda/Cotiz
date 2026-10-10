/** Métriques propres à Cotiz (en plus de celles du processus et de Node, exportées par prom-client). */
export const HTTP_REQUESTS = 'cotiz_http_requests_total';
export const HTTP_DURATION = 'cotiz_http_request_duration_seconds';
export const QUEUE_JOBS = 'cotiz_queue_jobs';
export const OUTBOX_UNPUBLISHED = 'cotiz_outbox_unpublished_events';
export const OUTBOX_OLDEST_AGE = 'cotiz_outbox_oldest_unpublished_age_seconds';
export const COLLECT_ERRORS = 'cotiz_metrics_collect_errors_total';

/** Toutes nos métriques : le tableau Grafana (infra/grafana/) ne cite qu'elles et celles de prom-client. */
export const METRIC_NAMES = [
  HTTP_REQUESTS,
  HTTP_DURATION,
  QUEUE_JOBS,
  OUTBOX_UNPUBLISHED,
  OUTBOX_OLDEST_AGE,
  COLLECT_ERRORS,
] as const;
