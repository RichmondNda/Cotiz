# Grafana

Tableaux versionnés, importés dans Grafana au lot 7.1 (Dashboards › Import, source de données Prometheus).

| Fichier | Tableau | Sources |
|---|---|---|
| `sante-api.json` | Santé API : RED par route, files BullMQ, retard de l'outbox, processus | `/metrics` de l'api (`API_METRICS_PORT`, 9464) et du worker (`WORKER_METRICS_PORT`, 9465) |

Les métriques sont servies sur un port interne de chaque processus, jamais sous `/api/v1` ni derrière le proxy public.
`backend/src/shared/metrics/dashboard.test.ts` vérifie que chaque requête du tableau ne cite que des métriques exportées.
